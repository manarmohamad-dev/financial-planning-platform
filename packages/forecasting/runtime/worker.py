"""Fixed, bounded forecasting protocol. No financial-engine calculations or IO files."""
import json
import sys
import platform
from decimal import Decimal as D, getcontext, ROUND_HALF_UP

getcontext().prec = 40
VERSION = 'forecast-1.0.0'
MAX = D('1000000000000')


def restrict():
    # Applied after trusted standard-library imports; no user modules or paths.
    if sys.platform != 'win32':
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
        resource.setrlimit(resource.RLIMIT_AS, (268435456, 268435456))
        resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    else:
        import ctypes as C
        from ctypes import wintypes as W
        class Basic(C.Structure):
            _fields_ = [('processTime', C.c_int64), ('jobTime', C.c_int64), ('flags', W.DWORD), ('minWorkingSet', C.c_size_t), ('maxWorkingSet', C.c_size_t), ('activeProcesses', W.DWORD), ('affinity', C.c_size_t), ('priority', W.DWORD), ('scheduling', W.DWORD)]
        class IO(C.Structure):
            _fields_ = [(name, C.c_uint64) for name in ('readOps', 'writeOps', 'otherOps', 'readBytes', 'writeBytes', 'otherBytes')]
        class Extended(C.Structure):
            _fields_ = [('basic', Basic), ('io', IO), ('processMemory', C.c_size_t), ('jobMemory', C.c_size_t), ('peakProcess', C.c_size_t), ('peakJob', C.c_size_t)]
        kernel = C.WinDLL('kernel32', use_last_error=True)
        kernel.CreateJobObjectW.restype = W.HANDLE
        kernel.CreateJobObjectW.argtypes = [C.c_void_p, W.LPCWSTR]
        kernel.SetInformationJobObject.argtypes = [W.HANDLE, C.c_int, C.c_void_p, W.DWORD]
        kernel.AssignProcessToJobObject.argtypes = [W.HANDLE, W.HANDLE]
        kernel.GetCurrentProcess.restype = W.HANDLE
        job = kernel.CreateJobObjectW(None, None)
        limits = Extended()
        limits.basic.flags = 0x100 | 0x2 | 0x8  # process memory, CPU time, active process cap
        limits.basic.processTime = 5 * 10000000
        limits.basic.activeProcesses = 1
        limits.processMemory = 268435456
        if not job or not kernel.SetInformationJobObject(job, 9, C.byref(limits), C.sizeof(limits)) or not kernel.AssignProcessToJobObject(job, kernel.GetCurrentProcess()):
            raise RuntimeError('RESOURCE_LIMIT_UNAVAILABLE')
        # Keep the handle alive until process exit; no child processes are permitted.
    def audit(event, args):
        if event == 'open' or event.startswith(('socket.', 'subprocess.', 'os.system', 'os.exec', 'os.spawn')):
            raise PermissionError('RUNTIME_ACCESS_DENIED')
    sys.addaudithook(audit)


def text(v):
    return str(v.quantize(D('.000001'), rounding=ROUND_HALF_UP))


def predict(name, y, h):
    if name == 'naive':
        out = [y[-1]] * h
    elif name == 'moving_average_3':
        out = [sum(y[-3:]) / 3] * h
    elif name == 'holt':
        level, trend = y[0], y[1] - y[0]
        for value in y[1:]:
            old = level
            level = D('.6') * value + D('.4') * (level + trend)
            trend = D('.2') * (level - old) + D('.8') * trend
        out = [level + (i + 1) * trend for i in range(h)]
    else:
        if len(y) < 24:
            raise ValueError('INSUFFICIENT_SEASONAL_HISTORY')
        level = sum(y[:12]) / 12
        trend = (sum(y[12:24]) - sum(y[:12])) / 144
        seasons = [v - level for v in y[:12]]
        for i in range(12, len(y)):
            old, old_trend, season = level, trend, seasons[i % 12]
            level = D('.4') * (y[i] - season) + D('.6') * (level + trend)
            trend = D('.1') * (level - old) + D('.9') * trend
            seasons[i % 12] = D('.2') * (y[i] - old - old_trend) + D('.8') * season
        out = [level + (i + 1) * trend + seasons[(len(y) + i) % 12] for i in range(h)]
    if any(not v.is_finite() or v < 0 or v > MAX for v in out):
        raise ValueError('PREDICTION_OUT_OF_RANGE')
    return [D(text(v)) for v in out]


def metrics(predicted, actual):
    errors = [p - a for p, a in zip(predicted, actual)]
    return {'mae': text(sum(abs(e) for e in errors) / len(errors)),
            'rmse': text((sum(e * e for e in errors) / len(errors)).sqrt())}


def months(start, count):
    year, month = map(int, start.split('-'))
    return [f'{(year * 12 + month - 1 + i) // 12:04d}-{(year * 12 + month - 1 + i) % 12 + 1:02d}' for i in range(count)]


def run(payload):
    series, h = payload['series'], payload['horizon']
    assert payload['version'] == VERSION and h in (3, 6, 12)
    assert 12 + 3 * h <= len(series) <= 120
    assert [p['period'] for p in series] == months(series[0]['period'], len(series))
    assert payload['origin'] == months(series[-1]['period'], 2)[-1]
    y = [D(p['value']) for p in series]
    assert all(v.is_finite() and 0 <= v <= MAX for v in y)
    configs = {'naive': {}, 'moving_average_3': {'window': 3},
               'holt': {'alpha': '.6', 'beta': '.2'},
               'holt_winters_additive': {'alpha': '.4', 'beta': '.1', 'gamma': '.2', 'seasonLength': 12}}
    candidates = []
    assert len(payload['folds']) == 3
    for i, fold in enumerate(payload['folds']):
        n = len(y) - (3 - i) * h
        assert fold == dict(trainStart=series[0]['period'], trainEnd=series[n-1]['period'], validationStart=series[n]['period'], validationEnd=series[n+h-1]['period'], trainCount=n, horizon=h)
    for name, config in configs.items():
        candidate = dict(model=name, modelVersion='fixed-1', configuration=config, status='succeeded', reason='Evaluated on three future validation windows.', metrics=None, folds=[], points=[])
        candidates.append(candidate)
        if name == 'holt_winters_additive' and payload['folds'][0]['trainCount'] < 24:
            candidate.update(status='not_applicable', reason='Every seasonal training fold needs two complete annual cycles.')
            continue
        try:
            pooled_p, pooled_a = [], []
            for i, fold in enumerate(payload['folds']):
                n = fold['trainCount']
                prediction = predict(name, y[:n], h)
                actual = y[n:n+h]
                candidate['folds'].append(dict(fold=i, predictions=[dict(period=series[n+j]['period'], value=text(v)) for j, v in enumerate(prediction)], actual=series[n:n+h], metrics=metrics(prediction, actual)))
                pooled_p.extend(prediction)
                pooled_a.extend(actual)
            candidate['metrics'] = metrics(pooled_p, pooled_a)
            future = predict(name, y, h)
            candidate['points'] = [dict(period=period, value=text(v)) for period, v in zip(months(payload['origin'], h), future)]
        except (ValueError, ArithmeticError):
            candidate.update(status='failed', reason='Candidate prediction is outside the supported numerical domain.', points=[])
    benchmark = candidates[0]
    selected = None
    if benchmark['status'] == 'succeeded':
        if all(D(p['value']) == D(a['value']) for f in benchmark['folds'] for p, a in zip(f['predictions'], f['actual'])):
            selected = benchmark
        else:
            mean = sum(y[-3*h:]) / (3*h)
            adequate = [c for c in candidates[1:] if c['status'] == 'succeeded'
                        and D(c['metrics']['mae']) <= D(benchmark['metrics']['mae']) * D('.9')
                        and D(c['metrics']['rmse']) <= D(benchmark['metrics']['rmse'])
                        and D(c['metrics']['mae']) <= mean * D('.5')
                        and sum(D(f['metrics']['mae']) < D(b['metrics']['mae']) for f, b in zip(c['folds'], benchmark['folds'])) >= 2]
            if adequate:
                selected = min(adequate, key=lambda c: (D(c['metrics']['mae']), D(c['metrics']['rmse']), list(configs).index(c['model'])))
    return dict(version=VERSION, status='supported' if selected else 'fallback', selectedModel=selected['model'] if selected else None,
                reason=('Naive benchmark had zero error on all validation windows.' if selected == benchmark else 'Selected model improves MAE by at least 10%, does not worsen RMSE, wins two folds and meets the absolute-error policy.') if selected else 'No candidate met the declared evidence policy. Supply explicit assumptions.',
                points=selected['points'] if selected else [], candidates=candidates,
                uncertainty=dict(kind='unavailable', reason='Point forecasts are not guarantees. Three validation errors per lead do not support calibrated prediction intervals; no statistical interval is claimed.'),
                runtime=dict(python=platform.python_version(), implementation=platform.python_implementation(), decimalPrecision=40, algorithmVersion='fixed-1'))


if __name__ == '__main__':
    restrict()
    try:
        raw = sys.stdin.buffer.read(65537)
        assert len(raw) <= 65536
        result = run(json.loads(raw))
        sys.stdout.write(json.dumps(result, separators=(',', ':')))
    except Exception:
        sys.stderr.write('FORECAST_RUNTIME_FAILED')
        sys.exit(1)
