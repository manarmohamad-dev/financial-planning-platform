import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  Money,
  Rate,
  forecastToMoney,
  periodSchema,
  currencySchema,
  moneySchema,
  draftPayloadSchema,
  timingSchema,
  scenarioSchema,
  changeSchema,
  capabilitySchema,
  engineInputSchema,
  engineOutputSchema,
  forecastRequestSchema,
  forecastResponseSchema,
  runManifestSchema,
  jobSchema,
  jobTransitions,
  CONTRACT_VERSION,
  ROUNDING_POLICY,
  requireRevision,
  assertMutable,
  resolvedSourcesSchema,
} from '../packages/contracts/src/index.js';
import { readConfig } from '../apps/api/src/config.js';
import { safeRequestLog, createLogger } from '../apps/api/src/logging.js';
describe('monetary contracts', () => {
  it.each(['12.50', '0', '-0.005', '999999999999999999.999999'])(
    'accepts exact decimal string %s',
    (v) => expect(moneySchema.parse(v)).toBe(v),
  );
  it.each([12.5, 'NaN', 'Infinity', '1e4', '01.2', '0.1234567', '1000000000000000000'])(
    'rejects invalid money %s',
    (v) => expect(moneySchema.safeParse(v).success).toBe(false),
  );
  it('adds 0.1 and 0.2 exactly', () =>
    expect(Money.parse('0.1', 'EGP').add(Money.parse('0.2', 'EGP')).serialize()).toBe('0.300000'));
  it.each([
    ['1.005', '1.01'],
    ['-1.005', '-1.01'],
    ['1.004', '1.00'],
  ])('rounds %s to %s', (a, b) => expect(Money.parse(a, 'EGP').quantize()).toBe(b));
  it('allocates deterministic remainder', () =>
    expect(
      Money.parse('0.05', 'EGP').allocate(['0.333333333333', '0.333333333333', '0.333333333334']),
    ).toEqual(['0.02', '0.02', '0.01']));
  it('rejects incomplete timing', () =>
    expect(() => Money.parse('100', 'SAR').allocate(['0.5', '0.4'])).toThrow('TIMING_INCOMPLETE'));
  it('rejects currency mismatch', () =>
    expect(() => Money.parse('1', 'EGP').add(Money.parse('1', 'USD'))).toThrow(
      'CURRENCY_MISMATCH',
    ));
  it('keeps rate arithmetic decimal', () =>
    expect(Money.parse('100', 'USD').multiply(new Rate('0.15').value).serialize()).toBe(
      '15.000000',
    ));
  it.each([Infinity, -Infinity, NaN])('rejects non-finite forecast %s', (v) =>
    expect(() => forecastToMoney(v, 'AED')).toThrow('FORECAST_NONFINITE'),
  );
  it('converts statistical boundary', () =>
    expect(forecastToMoney(12.125, 'EGP').quantize()).toBe('12.13'));
  it('does not double-round a calculated movement', () => {
    const result = Money.parse('0.01', 'EGP').multiply('0.4999999');
    expect(result.quantize()).toBe('0.00');
    expect(() => result.serialize()).toThrow('PRECISION_REQUIRES_QUANTIZATION');
  });
  it('cannot create a negative receipt allocation from a positive receipt', () =>
    expect(Money.parse('0.02', 'EGP').allocate(['0.3', '0.3', '0.3', '0.1'])).toEqual([
      '0.01',
      '0.01',
      '0.00',
      '0.00',
    ]));
  it('rejects overflow after quantization', () =>
    expect(() => Money.parse('999999999999999999.999999', 'EGP').quantize()).toThrow(
      'MONEY_OVERFLOW',
    ));
  it('allocations conserve positive and negative totals across many small values', () => {
    for (let cents = -99; cents <= 99; cents++) {
      const value = `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
      const original = Money.parse(value, 'EGP');
      const sum = original
        .allocate(['0.27', '0.27', '0.27', '0.19'])
        .reduce((a, b) => a.add(Money.parse(b, 'EGP')), Money.parse('0', 'EGP'));
      expect(sum.quantize()).toBe(original.quantize());
    }
  });
});
describe('domain boundaries', () => {
  it.each(['2026-01', '2026-12'])('accepts month %s', (v) => expect(periodSchema.parse(v)).toBe(v));
  it.each(['2026-00', '2026-13', '26-01', '2026-01-01', '0000-01'])('rejects month %s', (v) =>
    expect(periodSchema.safeParse(v).success).toBe(false),
  );
  it('rejects unsupported currency', () =>
    expect(currencySchema.safeParse('EUR').success).toBe(false));
  it('rejects unknown fields', () =>
    expect(
      draftPayloadSchema.safeParse({ title: 'Test', assumptions: [], workspace_id: randomUUID() })
        .success,
    ).toBe(false));
  it('guards revision and immutability', () => {
    expect(() => requireRevision(2, 1)).toThrow('VERSION_CONFLICT');
    expect(() => assertMutable('confirmed')).toThrow('IMMUTABLE_VERSION');
    expect(() => requireRevision(2, 2)).not.toThrow();
  });
  it('validates supported timing contract', () => {
    const source = { kind: 'assumption', versionId: randomUUID(), confirmed: true };
    expect(
      timingSchema.safeParse({
        componentId: randomUUID(),
        basis: 'purchases',
        buckets: [{ offsetMonths: 0, proportion: '0.8' }],
        source,
      }).success,
    ).toBe(false);
  });
  it('detects invalid scenario composition contract', () => {
    const id = randomUUID();
    const change = {
      id,
      target: 'revenue',
      scope: { kind: 'company' },
      operation: 'multiply',
      unit: 'ratio',
      value: '0.85',
      start: '2026-01',
      end: '2026-03',
      reference: 'previous_change',
      dependencies: [],
      source: { kind: 'assumption', versionId: randomUUID(), confirmed: true },
    };
    expect(changeSchema.safeParse(change).success).toBe(false);
    expect(
      scenarioSchema.safeParse({
        contractVersion: CONTRACT_VERSION,
        workspaceId: randomUUID(),
        baselineVersionId: randomUUID(),
        changes: [{ ...change, reference: 'baseline' }],
      }).success,
    ).toBe(true);
  });
  it('can be ready and assumption-led', () =>
    expect(
      capabilitySchema.parse({
        capability: 'hiring',
        readiness: 'ready',
        evidence: ['assumption_led'],
        findings: [],
      }).readiness,
    ).toBe('ready'));
  it('rejects duplicate sources but separates activity from cash', () => {
    const source = {
      componentId: randomUUID(),
      period: '2026-01',
      scope: { kind: 'company' },
      basis: 'recognized',
      amount: '10',
      currency: 'EGP',
      source: { kind: 'assumption', versionId: randomUUID(), confirmed: true },
    };
    expect(resolvedSourcesSchema.safeParse([source, source]).success).toBe(false);
    expect(
      resolvedSourcesSchema.safeParse([source, { ...source, basis: 'cash_receipt' }]).success,
    ).toBe(true);
  });
  it('rejects incomplete manifests and financial snapshots', () => {
    expect(runManifestSchema.safeParse({}).success).toBe(false);
    expect(engineInputSchema.safeParse({}).success).toBe(false);
    expect(engineOutputSchema.safeParse({}).success).toBe(false);
  });
  it('defines versioned statistical request/response', () => {
    expect(
      forecastRequestSchema.safeParse({
        contractVersion: CONTRACT_VERSION,
        requestId: randomUUID(),
        frequency: 'monthly',
        series: [],
        horizonMonths: 3,
        candidates: ['naive'],
        folds: [],
      }).success,
    ).toBe(true);
    expect(forecastResponseSchema.safeParse({}).success).toBe(false);
  });
  it('defines separate job and run identity with terminal states', () => {
    expect(
      jobSchema.safeParse({
        contractVersion: CONTRACT_VERSION,
        id: randomUUID(),
        workspaceId: randomUUID(),
        actorId: randomUUID(),
        operation: 'forecast',
        inputVersionIds: [],
        idempotencyKey: 'forecast-1',
        runId: null,
        status: 'queued',
        attempt: 0,
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
    expect(jobTransitions.succeeded).toEqual([]);
    expect(ROUNDING_POLICY).toBe('minor-unit-half-up-v1');
  });
});
describe('configuration and safe logging', () => {
  const env = {
    APP_ORIGIN: 'http://localhost:4200',
    DATABASE_URL: 'postgresql://localhost/db',
    SESSION_SECRET: 'x'.repeat(48),
  };
  it('validates environment without echoing secrets', () => {
    expect(readConfig(env).PORT).toBe(3000);
    expect(() => readConfig({ ...env, SESSION_SECRET: 'short' })).toThrow();
  });
  it('requires HTTPS production origin', () =>
    expect(() => readConfig({ ...env, NODE_ENV: 'production' })).toThrow());
  it('rejects origin with path', () =>
    expect(() => readConfig({ ...env, APP_ORIGIN: 'http://localhost:4200/path' })).toThrow());
  it('never logs query parameters', () =>
    expect(safeRequestLog('GET', '/api/path?token=secret', 200, 'id').route).toBe('/api/path'));
  it('redacts configured secrets', () => {
    const chunks: string[] = [];
    const log = createLogger({
      write: (chunk) => {
        chunks.push(chunk);
      },
    });
    log.info({
      password: 'do-not-leak',
      req: { headers: { cookie: 'private-cookie' }, body: { amount: '100000' } },
      token: 'invite-secret',
    });
    const output = chunks.join('');
    expect(output).toContain('[REDACTED]');
    for (const value of ['do-not-leak', 'private-cookie', '100000', 'invite-secret'])
      expect(output).not.toContain(value);
  });
});
