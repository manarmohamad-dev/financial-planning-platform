import { describe, it, expect } from 'vitest';
import { Money, ROUNDING_POLICY } from '../packages/contracts/src/index.js';
import { fixtureDocument, fixtureEntry } from '../packages/planning/src/fixtures.js';
import { calculateBaseline } from '../packages/planning/src/engine.js';
import {
  ENGINE_VERSION,
  PLANNING_CONTRACT,
  type BaselineSnapshot,
  type PlanningEntry,
} from '../packages/planning/src/model.js';
import {
  runScenario,
  evaluateScenario,
  ScenarioBlocked,
  derivedId,
} from '../packages/scenarios/src/engine.js';
import { entryChange } from '../packages/scenarios/src/fixtures.js';
import {
  SCENARIO_CONTRACT,
  SCENARIO_ENGINE,
  comparisonMetrics,
  type ScenarioChange,
  type ScenarioDocument,
  type ScenarioSnapshot,
} from '../packages/scenarios/src/model.js';
const id = derivedId('test-baseline'),
  actor = derivedId('test-actor');
function baseline(): BaselineSnapshot {
  const document = fixtureDocument([
    fixtureEntry(1, { componentKey: 'sales', driver: { kind: 'fixed', amount: '1000' } }),
    fixtureEntry(2, {
      componentKey: 'rent',
      category: 'rent',
      effect: 'operating_expense',
      driver: { kind: 'fixed', amount: '200' },
      source: 'schedule',
    }),
  ]);
  document.openingCash!.available = '1000';
  return {
    contractVersion: PLANNING_CONTRACT,
    workspaceId: id,
    planningVersionId: id,
    baselineVersionId: id,
    actorId: actor,
    confirmedBy: actor,
    confirmedAt: '2026-01-01T00:00:00.000Z',
    suppliedBy: {},
    document,
    reservePolicy: { id, minimum: '500', note: 'Explicit reserve' },
    engineVersion: ENGINE_VERSION,
    roundingPolicyVersion: ROUNDING_POLICY,
  };
}
function adjust(
  operation: 'set' | 'add' | 'subtract' | 'percentage_increase' | 'percentage_decrease' | 'remove',
  value: string | null = '0.1',
  decision: 'sales' | 'spending' = 'sales',
): ScenarioChange {
  return {
    id: derivedId('adjust-' + decision),
    label: 'Explicit test change',
    decision,
    currency: 'EGP',
    scope: { kind: 'company' },
    source: { kind: 'assumption', note: 'Explicit test assumption', reference: 'manual-test' },
    dependencies: [],
    primitive: {
      kind: 'adjust',
      targetEntryId: fixtureEntry(decision === 'sales' ? 1 : 2).id,
      start: '2026-01',
      end: '2026-03',
      operation,
      value,
      cashReplacement: null,
    },
  };
}
function added(
  key: string,
  decision: ScenarioChange['decision'],
  overrides: Partial<PlanningEntry>,
) {
  return entryChange(key, decision, overrides);
}
function hiring(count = 1, start = '2026-01', onboardingCost: string | null = null) {
  return added('new_team', 'hiring', {
    category: 'payroll',
    effect: 'operating_expense',
    start,
    driver: { kind: 'headcount', count, monthlyCost: '300', onboardingCost },
  });
}
function marketing() {
  return added('new_marketing', 'spending', {
    category: 'marketing',
    effect: 'operating_expense',
    driver: { kind: 'fixed', amount: '100' },
  });
}
function expansion(delayed = false) {
  return [
    added('investment', 'expansion', {
      category: 'capex',
      effect: 'cash_payment',
      end: '2026-01',
      driver: { kind: 'fixed', amount: '900' },
      cashTreatment: { kind: 'not_modeled' },
    }),
    added('branch_rent', 'expansion', {
      category: 'rent',
      effect: 'operating_expense',
      driver: { kind: 'fixed', amount: '100' },
    }),
    added('branch_team', 'expansion', {
      category: 'payroll',
      effect: 'operating_expense',
      driver: { kind: 'headcount', count: 1, monthlyCost: '200', onboardingCost: null },
    }),
    ...['100', '400', '700'].map((amount, i) =>
      added('branch_sales_' + i, 'expansion', {
        componentKey: 'branch_sales',
        start: `2026-0${i + 1}`,
        end: `2026-0${i + 1}`,
        driver: { kind: 'fixed', amount },
        cashTreatment: {
          kind: 'profile',
          buckets: [{ offsetMonths: delayed ? 1 : 0, proportion: '1' }],
        },
      }),
    ),
  ];
}
function snapshot(
  changes: ScenarioChange[],
  b = baseline(),
  type: ScenarioDocument['type'] = changes.length === 1 ? changes[0].decision : 'combined',
): ScenarioSnapshot {
  return {
    contractVersion: SCENARIO_CONTRACT,
    scenarioEngineVersion: SCENARIO_ENGINE,
    scenarioVersionId: derivedId('scenario-v1'),
    confirmedBy: actor,
    confirmedAt: '2026-01-02T00:00:00.000Z',
    createdBy: actor,
    actorId: actor,
    capturedAt: '2026-01-02T00:00:00.000Z',
    suppliedBy: {},
    baseline: b,
    document: {
      contractVersion: SCENARIO_CONTRACT,
      title: 'Independent golden case',
      baselineVersionId: b.baselineVersionId,
      currency: 'EGP',
      type,
      changes,
      expansion: changes.some((c) => c.decision === 'expansion')
        ? {
            revenueMode: 'modeled',
            costsReviewed: true,
            note: 'Explicit expansion revenue and costs',
          }
        : null,
      paybackRequested: true,
    },
  };
}
const execute = (changes: ScenarioChange[], b = baseline(), type?: ScenarioDocument['type']) =>
  runScenario(snapshot(changes, b, type));
const closing = (r: ReturnType<typeof runScenario>) => r.scenario.periods.map((p) => p.closingCash);

// All expected monetary literals are hand-calculated independently of both engines.
describe('M3 golden financial scenarios', () => {
  it('sales +10% revenue with no invented costs', () => {
    const r = execute([adjust('percentage_increase', '0.1')]);
    expect(closing(r)).toEqual(['1900.00', '2800.00', '3700.00']);
    expect(r.scenario.periods.map((p) => p.operatingExpenses)).toEqual([
      '200.00',
      '200.00',
      '200.00',
    ]);
  });
  it('sales -20% revenue', () => {
    expect(closing(execute([adjust('percentage_decrease', '0.2')]))).toEqual([
      '1600.00',
      '2200.00',
      '2800.00',
    ]);
  });
  it('sales absolute increase', () => {
    expect(execute([adjust('add', '50')]).scenario.periods[0].revenue).toBe('1050.00');
  });
  it('sales absolute decrease', () => {
    expect(execute([adjust('subtract', '50')]).scenario.periods[0].revenue).toBe('950.00');
  });
  it('sales retains delayed collection and tail', () => {
    const b = baseline();
    b.document.entries[0].cashTreatment = {
      kind: 'profile',
      buckets: [{ offsetMonths: 1, proportion: '1' }],
    };
    const r = execute([adjust('percentage_increase', '0.1')], b);
    expect(closing(r)).toEqual(['800.00', '1700.00', '2600.00']);
    expect(r.scenario.tailMovements[0].amount).toBe('1100.00');
  });
  it('explicit linked variable cost is recalculated by Financial Engine', () => {
    const b = baseline();
    b.document.entries.push(
      fixtureEntry(3, {
        componentKey: 'fee',
        category: 'fees',
        effect: 'operating_expense',
        driver: { kind: 'revenue_linked', baseComponent: 'sales', rate: '0.1' },
      }),
    );
    const r = execute([adjust('percentage_increase', '0.1')], b);
    expect(r.scenario.periods[0].operatingExpenses).toBe('310.00');
    expect(r.comparison.periods[0].metrics.operatingResult.difference).toBe('90.00');
  });
  it('hiring one employee', () => {
    expect(closing(execute([hiring()]))).toEqual(['1500.00', '2000.00', '2500.00']);
  });
  it('hiring multiple employees', () => {
    expect(execute([hiring(3)]).scenario.periods[0].operatingExpenses).toBe('1100.00');
  });
  it('hiring starts mid-horizon', () => {
    expect(closing(execute([hiring(1, '2026-02')]))).toEqual(['1800.00', '2300.00', '2800.00']);
  });
  it('onboarding total applies once', () => {
    expect(
      execute([hiring(2, '2026-01', '50')]).scenario.periods.map((p) => p.operatingExpenses),
    ).toEqual(['850.00', '800.00', '800.00']);
  });
  it('hiring creates no revenue benefit', () => {
    expect(execute([hiring(4)]).scenario.periods.map((p) => p.revenue)).toEqual([
      '1000.00',
      '1000.00',
      '1000.00',
    ]);
  });
  it('recurring marketing increase', () => {
    expect(closing(execute([marketing()]))).toEqual(['1700.00', '2400.00', '3100.00']);
  });
  it('existing expense reduction', () => {
    expect(
      execute([adjust('subtract', '50', 'spending')]).scenario.periods[0].operatingExpenses,
    ).toBe('150.00');
  });
  it('one-time scheduled expense', () => {
    const c = marketing();
    if (c.primitive.kind === 'entry') {
      c.primitive.entry.start = c.primitive.entry.end = '2026-02';
      c.primitive.entry.date = '2026-02-10';
    }
    expect(closing(execute([c]))).toEqual(['1800.00', '2500.00', '3300.00']);
  });
  it('percentage expense change', () => {
    expect(
      execute([adjust('percentage_increase', '0.25', 'spending')]).scenario.periods[0]
        .operatingExpenses,
    ).toBe('250.00');
  });
  it('spending effective and end periods', () => {
    const c = adjust('set', '400', 'spending');
    if (c.primitive.kind === 'adjust') c.primitive.start = c.primitive.end = '2026-02';
    expect(execute([c]).scenario.periods.map((p) => p.operatingExpenses)).toEqual([
      '200.00',
      '400.00',
      '200.00',
    ]);
  });
  it('remove expense explicitly', () => {
    expect(
      execute([adjust('remove', null, 'spending')]).scenario.periods.map(
        (p) => p.operatingExpenses,
      ),
    ).toEqual(['0.00', '0.00', '0.00']);
  });
  it('expansion investment changes cash, not operating result', () => {
    const r = execute(expansion(), baseline(), 'expansion');
    expect(r.scenario.periods.map((p) => p.operatingResult)).toEqual([
      '600.00',
      '900.00',
      '1200.00',
    ]);
    expect(closing(r)).toEqual(['700.00', '1600.00', '2800.00']);
  });
  it('expansion recurring costs and payroll', () => {
    const r = execute(expansion(), baseline(), 'expansion');
    expect(r.scenario.periods.map((p) => p.operatingExpenses)).toEqual([
      '500.00',
      '500.00',
      '500.00',
    ]);
  });
  it('expansion explicit monthly revenue ramp', () => {
    expect(
      execute(expansion(), baseline(), 'expansion').scenario.periods.map((p) => p.revenue),
    ).toEqual(['1100.00', '1400.00', '1700.00']);
  });
  it('expansion delayed receipts', () => {
    const r = execute(expansion(true), baseline(), 'expansion');
    expect(closing(r)).toEqual(['600.00', '1200.00', '2100.00']);
    expect(r.scenario.tailMovements[0].amount).toBe('700.00');
  });
  it('expansion payback unavailable with unknown revenue', () => {
    const s = snapshot(expansion().slice(0, 3), baseline(), 'expansion');
    s.document.expansion = {
      revenueMode: 'excluded_unknown',
      costsReviewed: true,
      note: 'Revenue unknown; costs only',
    };
    const r = runScenario(s);
    expect(r.payback.status).toBe('unsupported');
    expect(r.readiness.limitations.join(' ')).toContain('Cost-only');
  });
  it('simple investment cash recovery in month two', () => {
    const changes = [
      added('investment', 'expansion', {
        category: 'capex',
        effect: 'cash_payment',
        end: '2026-01',
        driver: { kind: 'fixed', amount: '600' },
      }),
      added('benefit', 'expansion', { driver: { kind: 'fixed', amount: '400' } }),
    ];
    expect(execute(changes, baseline(), 'expansion').payback).toMatchObject({
      status: 'supported',
      period: '2026-02',
    });
  });
  it('payback not reached inside horizon', () => {
    expect(execute(expansion(), baseline(), 'expansion').payback.status).toBe('not_reached');
  });
  it('combined hiring plus marketing', () => {
    expect(closing(execute([hiring(), marketing()]))).toEqual(['1400.00', '1800.00', '2200.00']);
  });
  it('combined expansion payroll and sales decrease', () => {
    const r = execute([...expansion(), hiring(), adjust('percentage_decrease', '0.2')]);
    expect(closing(r)).toEqual(['200.00', '600.00', '1300.00']);
    expect(r.scenario.fundingGap).toBe('300.00');
    expect(r.scenario.firstReserveBreach).toBe('2026-01');
  });
  it('compatible changes on disjoint months use original baseline amounts', () => {
    const a = adjust('percentage_increase', '0.1'),
      b = adjust('percentage_decrease', '0.2');
    b.id = derivedId('second-adjustment');
    if (a.primitive.kind === 'adjust') a.primitive.end = '2026-01';
    if (b.primitive.kind === 'adjust') b.primitive.start = '2026-02';
    expect(execute([a, b]).scenario.periods.map((p) => p.revenue)).toEqual([
      '1100.00',
      '800.00',
      '800.00',
    ]);
  });
  it('overlapping set operations rejected', () => {
    const a = adjust('set', '100'),
      b = adjust('set', '200');
    b.id = derivedId('second-set');
    expect(() => execute([a, b])).toThrow(ScenarioBlocked);
  });
  it('duplicate payroll impact rejected', () => {
    const a = hiring(),
      b = structuredClone(a);
    b.id = derivedId('duplicate-hiring');
    if (b.primitive.kind === 'entry') b.primitive.entry.id = derivedId('duplicate-employee-entry');
    expect(() => execute([a, b])).toThrow(ScenarioBlocked);
  });
  it('duplicate investment payments rejected', () => {
    const all = expansion();
    const extra = structuredClone(all[0]);
    extra.id = derivedId('duplicate-capex');
    if (extra.primitive.kind === 'entry')
      extra.primitive.entry.id = derivedId('duplicate-capex-entry');
    expect(() => execute([...all, extra])).toThrow(ScenarioBlocked);
  });
});
describe('M3 financial invariants and validation', () => {
  it('direct investment cash cannot silently ignore a delayed timing profile', () => {
    const s = snapshot(expansion(), baseline(), 'expansion');
    const investment = s.document.changes[0].primitive;
    if (investment.kind !== 'entry') throw new Error('Expected investment entry');
    investment.entry.cashTreatment = {
      kind: 'profile',
      buckets: [{ offsetMonths: 1, proportion: '1' }],
    };
    expect(evaluateScenario(s.baseline, s.document).findings.map((f) => f.code)).toContain(
      'DIRECT_CASH_TIMING',
    );
    expect(() => runScenario(s)).toThrow(ScenarioBlocked);
    investment.entry.cashTreatment = { kind: 'not_modeled' };
    investment.entry.start = '2026-02';
    investment.entry.end = '2026-02';
    expect(
      runScenario(s)
        .scenario.evidence.filter((m) => m.category === 'capex')
        .map((m) => [m.period, m.amount]),
    ).toEqual([['2026-02', '900.00']]);
  });
  it('expansion needs explicit cost coverage review', () => {
    const s = snapshot(expansion(), baseline(), 'expansion');
    s.document.expansion!.costsReviewed = false;
    expect(evaluateScenario(s.baseline, s.document).findings.map((f) => f.code)).toContain(
      'EXPANSION_COST_COVERAGE',
    );
    expect(() => runScenario(s)).toThrow(ScenarioBlocked);
  });
  it('zero changes equal baseline financial outputs', () => {
    const r = execute([]);
    expect(r.scenario.periods).toEqual(r.baseline.periods);
    expect(
      r.comparison.periods.every((p) =>
        Object.values(p.metrics).every((m) => m.difference === '0.00'),
      ),
    ).toBe(true);
  });
  it('immutable inputs replay identically and neither engine mutates baseline', () => {
    const b = baseline();
    const before = structuredClone(b);
    const historical = calculateBaseline(b);
    const s = snapshot([hiring(), marketing()], b);
    const copy = structuredClone(s);
    expect(runScenario(s)).toEqual(runScenario(s));
    expect(s).toEqual(copy);
    expect(b).toEqual(before);
    expect(calculateBaseline(b)).toEqual(historical);
  });
  it('monthly cash reconciles exactly and incremental series equals scenario minus baseline', () => {
    for (const changes of [[hiring()], [adjust('percentage_increase', '0.1')], expansion(true)]) {
      const r = execute(changes);
      for (const [i, p] of r.scenario.periods.entries()) {
        expect(
          Money.parse(p.openingCash!, 'EGP').add(Money.parse(p.netCashMovement!, 'EGP')).quantize(),
        ).toBe(p.closingCash);
        for (const k of comparisonMetrics)
          expect(r.comparison.periods[i].metrics[k].difference).toBe(
            Money.parse(p[k]!, 'EGP')
              .subtract(Money.parse(r.baseline.periods[i][k]!, 'EGP'))
              .quantize(),
          );
      }
    }
  });
  it('funding gap never creates financing', () => {
    const r = execute([hiring(10)]);
    expect(r.scenario.fundingGap).toBe('6100.00');
    expect(r.scenario.evidence.some((m) => m.category === 'financing')).toBe(false);
  });
  it('missing salary is explained rather than zeroed', () => {
    const c = hiring();
    if (c.primitive.kind === 'entry' && c.primitive.entry.driver.kind === 'headcount')
      c.primitive.entry.driver.monthlyCost = null;
    const s = snapshot([c]);
    const r = evaluateScenario(s.baseline, s.document);
    expect(r.readiness).toBe('missing_required_input');
    expect(r.findings.some((f) => f.code === 'HIRING_REQUIRED')).toBe(true);
  });
  it('negative financial effect is rejected', () => {
    expect(() => execute([adjust('subtract', '1001')])).toThrow(ScenarioBlocked);
  });
  it('out-of-horizon activity rejected', () => {
    const c = marketing();
    if (c.primitive.kind === 'entry') c.primitive.entry.end = '2026-04';
    expect(() => execute([c])).toThrow(ScenarioBlocked);
  });
  it('different currencies rejected', () => {
    const c = hiring();
    c.currency = 'USD';
    expect(() => execute([c])).toThrow(ScenarioBlocked);
  });
  it('unsupported branch scope rejected', () => {
    const c = hiring();
    c.scope = { kind: 'branch', id };
    expect(() => execute([c])).toThrow(ScenarioBlocked);
  });
  it('forecast source unsupported', () => {
    const c = adjust('add', '1');
    c.source.kind = 'forecast';
    expect(evaluateScenario(baseline(), snapshot([c]).document).readiness).toBe('unsupported');
  });
  it('dependency cycles rejected', () => {
    const a = hiring(),
      b = marketing();
    a.dependencies = [b.id];
    b.dependencies = [a.id];
    expect(() => execute([a, b])).toThrow(ScenarioBlocked);
  });
  it('missing dependencies rejected', () => {
    const c = hiring();
    c.dependencies = [id];
    expect(() => execute([c])).toThrow(ScenarioBlocked);
  });
  it('scenario-added revenue-linked cost requires explicit dependency', () => {
    const revenue = added('extra_sales', 'sales', { driver: { kind: 'fixed', amount: '100' } });
    const fee = added('extra_fee', 'spending', {
      category: 'fees',
      effect: 'operating_expense',
      driver: { kind: 'revenue_linked', baseComponent: 'extra_sales', rate: '0.05' },
    });
    expect(() => execute([fee, revenue])).toThrow(ScenarioBlocked);
    fee.dependencies = [revenue.id];
    expect(execute([fee, revenue]).scenario.periods[0].operatingExpenses).toBe('205.00');
  });
  it('composition order cannot silently change monetary results', () => {
    const a = execute([hiring(), marketing()]),
      b = execute([marketing(), hiring()]);
    expect(a.scenario.periods).toEqual(b.scenario.periods);
  });
  it('break-even is unavailable without contribution-margin inputs', () => {
    expect(execute([hiring()]).breakEven).toMatchObject({ status: 'unsupported', amount: null });
  });
  it('explicit baseline cash schedules require explicit replacement', () => {
    const b = baseline();
    b.document.entries[0].end = '2026-01';
    b.document.entries[0].cashTreatment = { kind: 'explicit' };
    b.document.entries.push(
      fixtureEntry(3, {
        componentKey: 'sales',
        category: 'known_receipt',
        effect: 'cash_receipt',
        start: '2026-02',
        end: '2026-02',
        driver: { kind: 'fixed', amount: '1000' },
        settles: { entryId: b.document.entries[0].id, activityPeriod: '2026-01' },
      }),
    );
    const c = adjust('add', '100');
    if (c.primitive.kind === 'adjust') c.primitive.end = '2026-01';
    expect(() => execute([c], b)).toThrow(ScenarioBlocked);
    if (c.primitive.kind === 'adjust')
      c.primitive.cashReplacement = [
        { period: '2026-03', activityPeriod: '2026-01', amount: '1100', date: '2026-03-10' },
      ];
    const r = execute([c], b);
    expect(r.scenario.periods.map((p) => p.cashInflows)).toEqual(['0.00', '0.00', '1100.00']);
  });
  it('incomplete explicit replacement cannot lose monetary value', () => {
    const b = baseline();
    b.document.entries[0].cashTreatment = { kind: 'explicit' };
    const c = adjust('add', '100');
    if (c.primitive.kind === 'adjust') c.primitive.cashReplacement = [];
    expect(() => execute([c], b)).toThrow(ScenarioBlocked);
  });
  it('wrong baseline relationship rejected', () => {
    const s = snapshot([hiring()]);
    s.document.baselineVersionId = derivedId('another-baseline');
    expect(() => runScenario(s)).toThrow(ScenarioBlocked);
  });
  it('unsupported transformation versions cannot replay silently', () => {
    const s = snapshot([hiring()]);
    Object.assign(s, { scenarioEngineVersion: 'unknown' });
    expect(() => runScenario(s)).toThrow('SCENARIO_VERSION_UNSUPPORTED');
  });
  it('cash unavailable stays null for an operating-only baseline', () => {
    const b = baseline();
    b.document.requestedOutputs = ['operating'];
    b.document.openingCash = null;
    const r = execute([hiring()], b);
    expect(r.scenario.periods[0].closingCash).toBeNull();
    expect(r.comparison.fundingGap.difference).toBeNull();
  });
  it('lineage distinguishes unchanged baseline sources and scenario assumptions', () => {
    const r = execute([adjust('add', '100')]);
    const revenue = r.scenario.evidence.find((m) => m.effect === 'revenue')!;
    const rent = r.scenario.evidence.find((m) => m.category === 'rent')!;
    expect(revenue.sourceVersionId).toBe(derivedId('scenario-v1'));
    expect(rent.sourceVersionId).toBe(id);
    expect(r.lineage.find((l) => l.entryId === revenue.entryId)?.baselineEntryId).toBe(
      fixtureEntry(1).id,
    );
  });
});
