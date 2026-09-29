import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { stressSource, stressDefinition, stressPolicy } from './stress-helpers.js';
import {
  runStress,
  evaluateRisk,
  assertCompatible,
  makeBrief,
} from '../packages/stress/src/engine.js';
import {
  definitionSchema,
  STRESS_VERSION,
  type Option,
  type Comparison,
} from '../packages/stress/src/model.js';
import { batchStatus } from '../apps/api/src/stress-service.js';
describe('M6 deterministic stress transformations and financial goldens', () => {
  it('zero stress reproduces all source financial periods', () => {
    const s = stressSource(),
      d = stressDefinition(s);
    d.modifications = [];
    d.template = 'zero';
    expect(runStress(s, d, randomUUID(), randomUUID(), stressPolicy()).financial.periods).toEqual(
      s.financial.periods,
    );
  });
  it('cannot silently confirm an empty adverse template or a changed zero reference', () => {
    const s = stressSource(), d = stressDefinition(s);
    d.modifications = [];
    expect(() => runStress(s, d, randomUUID(), randomUUID(), stressPolicy())).toThrow(/zero-stress/);
    d.template = 'zero';
    d.modifications = stressDefinition(s).modifications;
    expect(() => runStress(s, d, randomUUID(), randomUUID(), stressPolicy())).toThrow(/zero-stress/);
  });
  it.each([
    ['revenue_decrease', ['100.00', '100.00', '100.00']],
    ['expense_increase', ['104.00', '108.00', '112.00']],
    ['collection_delay', ['20.00', '40.00', '60.00']],
  ] as const)('%s reconciles through M2', (kind, cash) => {
    const s = stressSource(),
      d = stressDefinition(s, kind),
      r = runStress(s, d, randomUUID(), randomUUID(), stressPolicy());
    expect(r.financial.periods.map((p) => p.closingCash)).toEqual(cash);
    if (kind === 'collection_delay')
      expect(r.financial.tailMovements.map((m) => m.amount)).toEqual(['100.00']);
  });
  it('combined amount and timing stress does not double count', () => {
    const s = stressSource(),
      d = stressDefinition(s);
    d.modifications.push(...stressDefinition(s, 'collection_delay').modifications);
    const r = runStress(s, d, randomUUID(), randomUUID(), stressPolicy());
    expect(r.financial.periods.map((p) => p.closingCash)).toEqual(['20.00', '20.00', '20.00']);
    expect(r.financial.periods.map((p) => p.revenue)).toEqual(['80.00', '80.00', '80.00']);
  });
  it('half-up financial rounding remains in M2', () => {
    const s = stressSource();
    s.snapshot.document.entries[0].driver = { kind: 'fixed', amount: '1.005' };
    const d = stressDefinition(s, 'revenue_decrease', '0');
    const r = runStress(s, d, randomUUID(), randomUUID(), stressPolicy());
    expect(r.financial.periods[0].revenue).toBe('1.01');
  });
  it('stored forecast values are stressed as assumptions without fitting', () => {
    const s = stressSource();
    const e = s.snapshot.document.entries[0];
    e.source = 'forecast';
    e.start = e.end = '2026-01';
    e.forecastRef = { artifactId: randomUUID(), approvalId: randomUUID(), period: e.start };
    const d = stressDefinition(s);
    d.modifications[0].end = '2026-01';
    const r = runStress(s, d, randomUUID(), randomUUID(), stressPolicy());
    expect(r.financial.periods[0].revenue).toBe('80.00');
    expect(r.input.document.entries.find((x) => x.effect === 'revenue')?.source).toBe('assumption');
    expect(s.snapshot.document.entries[0].driver).toEqual({ kind: 'fixed', amount: '100' });
  });
  it('duplicate changes are rejected', () => {
    const s = stressSource(),
      d = stressDefinition(s);
    d.modifications.push({ ...d.modifications[0], id: randomUUID() });
    expect(() => runStress(s, d, randomUUID(), randomUUID(), stressPolicy())).toThrow(
      'Overlapping',
    );
  });
  it('unknown target is rejected', () => {
    const s = stressSource(),
      d = stressDefinition(s);
    d.modifications[0].targetEntryId = randomUUID();
    expect(() => runStress(s, d, randomUUID(), randomUUID(), stressPolicy())).toThrow('target');
  });
  it('unsupported primitives fail strict contracts', () => {
    const s = stressSource(),
      d = stressDefinition(s);
    expect(
      definitionSchema.safeParse({
        ...d,
        modifications: [{ ...d.modifications[0], kind: 'monte_carlo' }],
      }).success,
    ).toBe(false);
  });
  it('unknown dependencies are rejected', () => {
    const s = stressSource(),
      d = stressDefinition(s);
    d.modifications[0].dependencies = [randomUUID()];
    expect(() => runStress(s, d, randomUUID(), randomUUID(), stressPolicy())).toThrow(
      'Dependencies',
    );
  });
  it('out-of-horizon modification is rejected', () => {
    const s = stressSource(),
      d = stressDefinition(s);
    d.modifications[0].end = '2026-04';
    expect(() => runStress(s, d, randomUUID(), randomUUID(), stressPolicy())).toThrow('months');
  });
  it('explicit/net collections cannot be silently shifted', () => {
    const s = stressSource(),
      d = stressDefinition(s, 'collection_delay');
    s.snapshot.document.entries[0].cashTreatment = { kind: 'explicit' };
    expect(() => runStress(s, d, randomUUID(), randomUUID(), stressPolicy())).toThrow('profile');
  });
  it('edited template is an explicit change and does not mutate earlier inputs', () => {
    const s = stressSource(),
      a = stressDefinition(s),
      b = structuredClone(a);
    b.modifications[0].rate = '0.5';
    expect(
      runStress(s, a, randomUUID(), randomUUID(), stressPolicy()).financial.periods[0].revenue,
    ).toBe('80.00');
    expect(
      runStress(s, b, randomUUID(), randomUUID(), stressPolicy()).financial.periods[0].revenue,
    ).toBe('50.00');
  });
});
describe('M6 policy boundary and risk timeline', () => {
  it.each([
    ['99.99', 'breached'],
    ['100.00', 'met'],
    ['100.01', 'met'],
  ])('cash %s versus 100 → %s', (value, status) => {
    const s = stressSource();
    s.financial.periods.forEach((p) => (p.closingCash = value));
    expect(
      evaluateRisk(s.financial, stressPolicy(), { kind: 'baseline', id: s.ref.runId }).checks.find(
        (c) => c.ruleId === 'cash_reserve',
      )?.status,
    ).toBe(status);
  });
  it('groups a persistent breach and records recovery with exact evidence', () => {
    const s = stressSource(),
      p = stressPolicy(),
      ref = { kind: 'baseline' as const, id: s.ref.runId };
    s.financial.periods.forEach((x, i) => (x.closingCash = ['99', '98', '100'][i]));
    const r = evaluateRisk(s.financial, p, ref),
      f = r.findings.find((f) => f.ruleId === 'cash_reserve')!;
    expect(f).toMatchObject({
      firstPeriod: '2026-01',
      lastPeriod: '2026-02',
      durationMonths: 2,
      recoveryPeriod: '2026-03',
      recovery: 'within_horizon',
      threshold: '100',
      policyId: p.id,
      ruleVersion: '1',
      run: ref,
    });
    expect(f.evidence.map((e) => e.value)).toEqual(['99', '98']);
  });
  it('no observed recovery does not imply permanent failure', () => {
    const s = stressSource();
    s.financial.periods.forEach((p) => (p.closingCash = '90'));
    const f = evaluateRisk(s.financial, stressPolicy(), { kind: 'baseline', id: s.ref.runId })
      .findings[0];
    expect(f.recovery).toBe('not_observed');
    expect(f.durationMonths).toBe(3);
  });
  it('unknown cash is unavailable, never constraint satisfied', () => {
    const s = stressSource();
    s.financial.periods.forEach((p) => (p.closingCash = null));
    expect(
      evaluateRisk(s.financial, stressPolicy(), { kind: 'baseline', id: s.ref.runId }).checks[0]
        .status,
    ).toBe('unavailable');
  });
  it('policy changes create different findings without changing historical evaluation', () => {
    const s = stressSource(),
      p = stressPolicy(),
      ref = { kind: 'baseline' as const, id: s.ref.runId },
      old = evaluateRisk(s.financial, p, ref);
    const next = stressPolicy('200');
    next.revision = 2;
    expect(evaluateRisk(s.financial, next, ref).findings.length).toBeGreaterThan(
      old.findings.length,
    );
    expect(old.findings).toHaveLength(0);
  });
  it('operating losses and negative cash are distinct rules with explicit zero', () => {
    const s = stressSource();
    s.financial.periods[0].closingCash = '-1';
    s.financial.periods[0].operatingResult = '-2';
    const r = evaluateRisk(s.financial, stressPolicy(), { kind: 'baseline', id: s.ref.runId });
    expect(r.findings.map((f) => f.ruleId)).toContain('cash_negative');
    expect(r.findings.find((f) => f.ruleId === 'operating_floor')?.evidence[0].value).toBe('-2');
  });
});
describe('M6 comparison, brief and batch status', () => {
  const setup = () => {
    const source = stressSource(),
      policy = stressPolicy(),
      ref = { kind: 'baseline' as const, id: source.ref.runId };
    const option: Option = {
      label: 'Source',
      source,
      ref,
      financial: source.financial,
      risk: evaluateRisk(source.financial, policy, ref),
      definition: null,
    };
    return { policy, option };
  };
  it('compatible evidence is accepted', () => {
    const { policy, option } = setup();
    expect(() => assertCompatible([option, structuredClone(option)], policy)).not.toThrow();
  });
  it.each(['currency', 'horizon', 'basis', 'baseline', 'policy'] as const)(
    'rejects incompatible %s',
    (kind) => {
      const { policy, option } = setup(),
        other = structuredClone(option);
      if (kind === 'currency') other.financial.currency = 'USD';
      if (kind === 'horizon') other.financial.periods.pop();
      if (kind === 'basis')
        other.source.snapshot.document.coverage.revenueConvention = 'net_of_refunds';
      if (kind === 'baseline') other.source.baselineVersionId = randomUUID();
      if (kind === 'policy') other.risk.policyId = randomUUID();
      expect(() => assertCompatible([option, other], policy)).toThrow('Comparison requires');
    },
  );
  it('brief numbers refer to exact stored period/minimum fields and replay deterministically', () => {
    const { policy, option } = setup();
    const c: Comparison = {
      version: STRESS_VERSION,
      title: 'Decision evidence',
      policy,
      baselineVersionId: option.source.baselineVersionId,
      options: [option],
      failures: [],
      limitations: ['Monthly only'],
    };
    const b = makeBrief(c, 'comparison');
    expect(b.options[0].metrics.map((m) => m.value)).toEqual(['160.00', '120.00', '80.00']);
    expect(b.options[0].metrics[0].path).toBe('periods[2].closingCash');
    expect(b.options[0].ref).toEqual(option.ref);
    expect(makeBrief(c, 'comparison')).toEqual(b);
    expect(b.unsupported.join(' ')).toContain('Runway');
    expect(b.limitations).toEqual(['Monthly only']);
  });
  it.each([
    [['pending'], 'pending'],
    [['running', 'succeeded'], 'running'],
    [['succeeded', 'failed'], 'partially_failed'],
    [['succeeded', 'succeeded'], 'completed'],
    [['failed'], 'failed'],
  ] as const)('batch %s → %s', (states, status) =>
    expect(batchStatus([...states], false)).toBe(status),
  );
  it('cancellation preserves explicit batch cancellation despite successful siblings', () =>
    expect(batchStatus(['succeeded', 'cancelled'], true)).toBe('cancelled'));
});
