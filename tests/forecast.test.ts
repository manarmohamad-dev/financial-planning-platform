import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { history, futureTemplate } from './forecast-helpers.js';
import { eligibility, compose } from '../packages/forecasting/src/engine.js';
import {
  FORECAST_VERSION,
  type History,
  type Composition,
} from '../packages/forecasting/src/model.js';
import { runForecast } from '../apps/api/src/forecast-runtime.js';
const run = (h: History) =>
  runForecast({
    version: FORECAST_VERSION,
    series: h.observations.map(({ period, value }) => ({ period, value })),
    origin: h.origin,
    horizon: h.horizon as 3 | 6 | 12,
    folds: eligibility(h).folds,
  });
describe('M5 eligibility and temporal evidence', () => {
  it.each([3, 6, 12])('has separate minimum evidence for horizon %s', (H) => {
    expect(eligibility(history(12 + 3 * H, H)).status).toBe('eligible');
    expect(eligibility(history(11 + 3 * H, H)).status).toBe('insufficient_evaluation_evidence');
  });
  it('short history remains assumption led', () =>
    expect(eligibility(history(6)).status).toBe('insufficient_history'));
  it('unsupported horizon is explicit', () =>
    expect(eligibility(history(36, 9)).status).toBe('unsupported_horizon'));
  it.each([
    'gap',
    'duplicate',
    'negative',
    'partial',
    'assumption',
    'nonfinite',
    'too_large',
  ] as const)('rejects %s', (kind) => {
    const h = history();
    if (kind === 'gap') h.observations.splice(3, 1);
    if (kind === 'duplicate') h.observations[3].period = h.observations[2].period;
    if (kind === 'negative') h.observations[0].value = '-1';
    if (kind === 'partial') h.observations[0].partial = true;
    if (kind === 'assumption') h.observations[0].source = 'assumption';
    if (kind === 'nonfinite') h.observations[0].value = 'NaN';
    if (kind === 'too_large') h.observations[0].value = '1000000000001';
    expect(eligibility(h).status).toBe('invalid_series');
  });
  it.each(['declared', 'committed', 'schedule'] as const)(
    'known amounts are not forecast: %s',
    (kind) => {
      const h = history();
      if (kind === 'declared') h.nature = 'known_schedule';
      if (kind === 'committed') h.observations[0].committed = true;
      if (kind === 'schedule') h.observations[0].source = 'schedule';
      expect(eligibility(h).status).toBe('scheduled_not_forecast');
    },
  );
  it('declared structural change blocks', () => {
    const h = history();
    h.structuralChange = true;
    expect(eligibility(h).status).toBe('structural_change_requires_assumption');
  });
  it('large observed level change blocks', () =>
    expect(eligibility(history(36, 3, (i) => (i < 33 ? '100' : '1000'))).status).toBe(
      'structural_change_requires_assumption',
    ));
  it('folds are expanding and validation windows do not overlap', () => {
    const e = eligibility(history(36, 6));
    expect(e.folds.map((f) => f.trainCount)).toEqual([18, 24, 30]);
    expect(e.folds[0]).toEqual({
      trainStart: '2020-01',
      trainEnd: '2021-06',
      validationStart: '2021-07',
      validationEnd: '2021-12',
      trainCount: 18,
      horizon: 6,
    });
  });
  it('two full seasonal cycles are required in every training fold', () => {
    expect(eligibility(history(30)).seasonalSupported).toBe(false);
    expect(eligibility(history(33)).seasonalSupported).toBe(true);
  });
});
describe('M5 real constrained Python execution', () => {
  it('constant zero series has finite zero MAE/RMSE and naive wins ties', async () => {
    const r = await run(history(36, 3, () => '0'));
    expect(r.selectedModel).toBe('naive');
    expect(r.candidates[0].metrics).toEqual({ mae: '0.000000', rmse: '0.000000' });
    expect(r.points.map((p) => p.value)).toEqual(['0.000000', '0.000000', '0.000000']);
    expect(r.uncertainty.kind).toBe('unavailable');
  });
  it('linear trend selects Holt with exact future values', async () => {
    const r = await run(history());
    expect(r.selectedModel).toBe('holt');
    expect(r.points.map((p) => p.value)).toEqual(['172.000000', '174.000000', '176.000000']);
    expect(r.candidates[0].metrics?.mae).toBe('4.000000');
    expect(r.candidates[0].metrics?.rmse).toBe('4.320494');
  });
  it('genuine repeated seasonality selects seasonal Holt-Winters', async () => {
    const r = await run(
      history(48, 3, (i) => String(100 + [0, 10, 20, 30, 40, 50, 40, 30, 20, 10, 0, -10][i % 12])),
    );
    expect(r.selectedModel).toBe('holt_winters_additive');
    expect(r.points.map((p) => p.value)).toEqual(['100.000000', '110.000000', '120.000000']);
  });
  it('seasonal model is visibly unavailable with inadequate training', async () => {
    const r = await run(history(24));
    expect(r.candidates[3].status).toBe('not_applicable');
  });
  it('near-zero values remain finite without percentage division', async () => {
    const r = await run(history(36, 3, () => '0.000001'));
    expect(r.candidates[0].metrics?.mae).toBe('0.000000');
  });
  it('changing future validation values cannot change earlier fold predictions', async () => {
    const a = history(),
      b = structuredClone(a);
    b.observations[35].value = '175';
    const x = await run(a),
      y = await run(b);
    expect(x.candidates.map((c) => c.folds[0]?.predictions)).toEqual(
      y.candidates.map((c) => c.folds[0]?.predictions),
    );
  });
  it('repeated execution is deterministic', async () => {
    const h = history();
    expect(await run(h)).toEqual(await run(h));
  });
  it('timeout terminates execution', async () => {
    const h = history();
    await expect(
      runForecast(
        {
          version: FORECAST_VERSION,
          series: h.observations.map(({ period, value }) => ({ period, value })),
          origin: h.origin,
          horizon: 3,
          folds: eligibility(h).folds,
        },
        { timeoutMs: 1 },
      ),
    ).rejects.toThrow('FORECAST_TIMEOUT');
  });
  it('missing Python process is a sanitized failure', async () => {
    const h = history();
    await expect(
      runForecast(
        {
          version: FORECAST_VERSION,
          series: h.observations.map(({ period, value }) => ({ period, value })),
          origin: h.origin,
          horizon: 3,
          folds: eligibility(h).folds,
        },
        { python: 'nonexistent-forecast-python' },
      ),
    ).rejects.toThrow('FORECAST_PROCESS_FAILED');
  });
  it('independent Python numerical/failure oracles pass', () => {
    expect(() =>
      execFileSync(
        process.env.FORECAST_PYTHON ?? 'python',
        ['-I', 'tests/forecast_worker_test.py'],
        { stdio: 'pipe', windowsHide: true },
      ),
    ).not.toThrow();
  });
});
describe('M5 pure hybrid composition', () => {
  const input = (): Composition => ({
    idempotencyKey: 'test',
    templateVersionId: randomUUID(),
    artifactId: null,
    approvalId: null,
    componentKey: 'sales',
    origin: '2023-01',
    horizon: 3,
    title: 'Hybrid',
    mode: 'assumption',
    assumptionValues: ['172', '174', '176'],
    note: 'Reviewed expectation',
    cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 0, proportion: '1' }] },
    category: 'revenue',
    effect: 'revenue',
    replaceEntryIds: [],
    sourcesReviewed: true,
  });
  it('explicit replacement retains schedule and does not mutate template', () => {
    const t = futureTemplate(),
      before = structuredClone(t),
      i = input();
    i.replaceEntryIds = [t.entries[0].id];
    const c = compose(t, i, null);
    expect(t).toEqual(before);
    expect(c.document.entries).toHaveLength(4);
    expect(c.assignments.filter((a) => a.source === 'schedule')).toHaveLength(3);
    expect(c.assignments.filter((a) => a.source === 'assumption')).toHaveLength(3);
  });
  it('rejects silent overlap', () =>
    expect(() => compose(futureTemplate(), input(), null)).toThrow('Explicitly select'));
  it('rejects unrelated deletion', () => {
    const t = futureTemplate(),
      i = input();
    i.replaceEntryIds = t.entries.map((e) => e.id);
    expect(() => compose(t, i, null)).toThrow('unrelated');
  });
  it('rejects missing assumption months', () => {
    const t = futureTemplate(),
      i = input();
    i.replaceEntryIds = [t.entries[0].id];
    i.assumptionValues = ['1'];
    expect(() => compose(t, i, null)).toThrow('one explicit');
  });
  it('rejects mismatched horizon', () => {
    const i = input();
    i.horizon = 6;
    expect(() => compose(futureTemplate(), i, null)).toThrow('match');
  });
  it('never replaces a known future schedule with statistics', () => {
    const t = futureTemplate(),
      i = input();
    t.entries[0].source = 'schedule';
    i.mode = 'forecast';
    i.replaceEntryIds = [t.entries[0].id];
    expect(() => compose(t, i, null)).toThrow('Known future schedules');
  });
});
