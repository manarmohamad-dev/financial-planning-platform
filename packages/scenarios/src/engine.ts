import { Money, moneySchema } from '../../contracts/src/index.js';
import { calculateBaseline, evaluateCapabilities } from '../../planning/src/engine.js';
import {
  isCash,
  monthsFrom,
  monthDistance,
  type BaselineSnapshot,
  type PlanningEntry,
} from '../../planning/src/model.js';
import {
  SCENARIO_CONTRACT,
  SCENARIO_ENGINE,
  scenarioDocumentSchema,
  comparisonMetrics,
  type ScenarioDocument,
  type ScenarioFinding,
  type ScenarioReadiness,
  type ScenarioSnapshot,
  type ScenarioResult,
  type ScenarioChange,
  type InputLineage,
  type Difference,
  type Metric,
} from './model.js';

export class ScenarioBlocked extends Error {
  constructor(readonly report: ScenarioReadiness) {
    super('SCENARIO_BLOCKED');
  }
}
/** Stable non-security identifiers for derived input rows; never used as authorization. */
export function derivedId(key: string): string {
  const parts = [2166136261, 2246822507, 3266489909, 668265263]
    .map((seed) => {
      let n = seed;
      for (let i = 0; i < key.length; i++) {
        n ^= key.charCodeAt(i);
        n = Math.imul(n, 16777619);
      }
      return (n >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
  return `${parts.slice(0, 8)}-${parts.slice(8, 12)}-4${parts.slice(13, 16)}-8${parts.slice(17, 20)}-${parts.slice(20)}`;
}
const costCategories = new Set([
  'rent',
  'marketing',
  'software',
  'utilities',
  'fees',
  'other_operating',
  'cost_of_sales',
  'noncash',
  'depreciation',
]);
const allowedExpansion = new Set([
  'revenue',
  'payroll',
  ...costCategories,
  'capex',
  'purchases',
  'known_payment',
  'known_receipt',
]);
function stage(c: ScenarioChange) {
  const p = c.primitive;
  if (p.kind === 'adjust') return c.decision === 'sales' ? 1 : 4;
  const e = p.entry;
  return e.effect === 'revenue'
    ? 1
    : e.driver.kind === 'revenue_linked'
      ? 2
      : e.category === 'payroll'
        ? 3
        : isCash(e.effect)
          ? 5
          : 4;
}
function transform(
  b: BaselineSnapshot,
  raw: ScenarioDocument,
  versionId: string,
  actor: string,
  confirmedAt: string,
  suppliers: Record<string, string>,
) {
  const d = scenarioDocumentSchema.parse(raw);
  const input = structuredClone(b.document);
  const findings: ScenarioFinding[] = [];
  const lineage: InputLineage[] = input.entries.map((e) => ({
    entryId: e.id,
    baselineEntryId: e.id,
    changeId: null,
    sourceVersionId: b.planningVersionId,
    confirmedBy: b.confirmedBy,
    confirmedAt: b.confirmedAt,
    suppliedBy: b.suppliedBy[e.id] ?? b.confirmedBy,
  }));
  const flag = (
    code: string,
    message: string,
    change?: ScenarioChange,
    readiness: ScenarioFinding['readiness'] = 'invalid_conflicting_input',
  ) =>
    findings.push({
      code,
      message,
      readiness,
      ...(change ? { changeId: change.id } : {}),
      requirement: {
        necessity: 'required',
        permittedSources: ['observed', 'schedule', 'assumption'],
      },
    });
  const last = monthsFrom(input.projectionStart, input.horizonMonths).at(-1)!;
  if (d.baselineVersionId !== b.baselineVersionId)
    flag('BASELINE_MISMATCH', 'Select the exact published baseline that this scenario references.');
  if (d.currency !== input.currency)
    flag('CURRENCY_MISMATCH', 'Scenario and baseline must use the same base currency.');
  const ids = new Set(d.changes.map((c) => c.id));
  if (ids.size !== d.changes.length)
    flag(
      'DUPLICATE_CHANGE',
      'Each change must have a unique identity. Duplicate changes cannot be executed.',
    );
  const ordered: ScenarioChange[] = [];
  const pending = [...d.changes].sort((a, b) => stage(a) - stage(b) || a.id.localeCompare(b.id));
  const done = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex((c) => c.dependencies.every((id) => done.has(id)));
    if (index < 0) {
      flag('DEPENDENCY_CONFLICT', 'Changes contain a missing dependency or a dependency cycle.');
      break;
    }
    const c = pending.splice(index, 1)[0];
    if (c.dependencies.some((id) => stage(d.changes.find((x) => x.id === id)!) > stage(c)))
      flag(
        'DEPENDENCY_ORDER',
        'Dependencies must follow revenue, linked costs, payroll, spending, then cash commitment order.',
        c,
      );
    ordered.push(c);
    done.add(c.id);
  }
  const occupied = new Set<string>();
  for (const c of ordered) {
    const p = c.primitive;
    const start = p.kind === 'adjust' ? p.start : p.entry.start,
      end = p.kind === 'adjust' ? p.end : p.entry.end;
    if (c.currency !== d.currency || (p.kind === 'entry' && p.entry.currency !== d.currency))
      flag(
        'CURRENCY_MISMATCH',
        'Change currency must match the baseline; conversion is not supported.',
        c,
      );
    if (c.scope.kind !== 'company' || (p.kind === 'entry' && p.entry.scope.kind !== 'company'))
      flag(
        'SCOPE_UNSUPPORTED',
        'M3 supports company-level impacts. An expansion may represent a branch investment within the company, not separate branch accounts.',
        c,
        'unsupported',
      );
    if (d.type !== 'combined' && c.decision !== d.type)
      flag(
        'DECISION_TYPE_CONFLICT',
        'Use a Combined Decision when composing different decision types.',
        c,
      );
    if (c.source.kind === 'forecast')
      flag(
        'FORECAST_UNSUPPORTED',
        'Forecast evidence is not implemented. Supply an explicit assumption or known schedule.',
        c,
        'unsupported',
      );
    if (start < input.projectionStart || end > last || end < start) {
      flag(
        'OUTSIDE_HORIZON',
        'Decision activity must fall within the selected baseline horizon; its cash timing may extend beyond it.',
        c,
      );
      continue;
    }
    const target =
      p.kind === 'adjust' ? b.document.entries.find((e) => e.id === p.targetEntryId) : p.entry;
    if (!target) {
      flag('TARGET_MISSING', 'The target is not an input in the referenced baseline.', c);
      continue;
    }
    for (const period of monthsFrom(start, monthDistance(start, end) + 1)) {
      const key = `${target.componentKey}/${target.effect}/${period}`;
      if (occupied.has(key))
        flag(
          'OVERLAPPING_CHANGES',
          `More than one change affects ${target.componentKey} in ${period}. Resolve the overlap instead of applying an implicit order.`,
          c,
        );
      occupied.add(key);
    }
    if (p.kind === 'adjust') {
      if (!['sales', 'spending'].includes(c.decision))
        flag(
          'OPERATION_UNSUPPORTED',
          'Existing-amount adjustments are supported for Sales and Spending decisions; use explicit new entries for Hiring or Expansion.',
          c,
          'unsupported',
        );
      if (c.decision === 'sales' && target.effect !== 'revenue')
        flag('TARGET_INVALID', 'Sales changes must target recognized revenue.', c);
      if (
        c.decision === 'spending' &&
        (target.effect !== 'operating_expense' || !costCategories.has(target.category))
      )
        flag(
          'TARGET_INVALID',
          'Spending adjustments must target an operating expense other than payroll. Use an explicit hiring entry for new staff.',
          c,
        );
      if (target.driver.kind !== 'fixed')
        flag(
          'DERIVED_TARGET_UNSUPPORTED',
          'This target has a headcount or revenue-linked driver. Change its underlying revenue or add explicit payroll; do not overwrite a calculated cost.',
          c,
          'unsupported',
        );
      if (start < target.start || end > target.end)
        flag(
          'TARGET_PERIOD',
          'The target must exist throughout the requested range. Add a new scheduled expense for a new range.',
          c,
        );
      if (p.operation !== 'remove' && p.value === null)
        flag(
          'VALUE_REQUIRED',
          'Supply the amount or proportion needed to calculate this change. An explicit assumption is permitted.',
          c,
          'missing_required_input',
        );
      if (p.value?.startsWith('-'))
        flag(
          'NEGATIVE_VALUE',
          'Enter a nonnegative amount or proportion and choose increase or decrease.',
          c,
        );
      if (
        p.operation !== 'remove' &&
        !p.operation.startsWith('percentage') &&
        p.value !== null &&
        !moneySchema.safeParse(p.value).success
      )
        flag('MONEY_INVALID', 'Amount changes must use a supported decimal monetary amount.', c);
      if (d.changes.some((x) => x.primitive.kind === 'entry' && x.primitive.entry.id === target.id))
        flag('ENTRY_ID_CONFLICT', 'A new item cannot reuse a baseline entry identity.', c);
      if (
        target.cashTreatment.kind === 'explicit' &&
        p.cashReplacement === null &&
        b.document.requestedOutputs.includes('cash')
      )
        flag(
          'REPLACEMENT_CASH_REQUIRED',
          'This activity uses fixed cash schedules. Supply replacement receipts/payments for each changed activity month, including tail amounts; existing schedules are not automatically scaled.',
          c,
          'missing_required_input',
        );
      if (target.cashTreatment.kind !== 'explicit' && p.cashReplacement !== null)
        flag(
          'TIMING_CONFLICT',
          'Replacement cash is only valid for explicitly scheduled activity. A timing profile is recalculated by the Financial Engine.',
          c,
        );
      if (target.effect === 'revenue' && input.coverage.settlementConvention === 'net')
        flag(
          'NET_CHANGE_UNSUPPORTED',
          'Changing gross revenue against independent net settlements requires gross-to-net reconciliation, which is outside M3. Use a baseline with supported gross collection timing.',
          c,
          'unsupported',
        );
      for (const r of p.cashReplacement ?? [])
        if (
          r.activityPeriod < start ||
          r.activityPeriod > end ||
          r.period < r.activityPeriod ||
          monthDistance(last, r.period) > 120 ||
          (r.date && r.date.slice(0, 7) !== r.period)
        )
          flag(
            'REPLACEMENT_PERIOD',
            'Replacement cash must identify a changed activity month and a valid date at or after that activity, within the 120-month tail limit.',
            c,
          );
    } else {
      const e = p.entry;
      if (
        isCash(e.effect) &&
        e.cashTreatment.kind !== 'not_modeled' &&
        !(
          e.cashTreatment.kind === 'profile' &&
          e.cashTreatment.buckets.length === 1 &&
          e.cashTreatment.buckets[0].offsetMonths === 0 &&
          e.cashTreatment.buckets[0].proportion === '1'
        )
      )
        flag(
          'DIRECT_CASH_TIMING',
          'A direct investment, purchase or other cash movement is paid/received in its declared month. Set the payment months explicitly; a separate timing profile or non-cash treatment cannot shift this cash schedule.',
          c,
        );
      if (b.document.entries.some((x) => x.id === e.id))
        flag(
          'ENTRY_ID_CONFLICT',
          'A new item must have a new identity, not reuse a baseline row.',
          c,
        );
      if (e.source !== c.source.kind || e.note !== c.source.note)
        flag(
          'EVIDENCE_CONFLICT',
          'The financial entry and scenario change must identify the same supplied evidence.',
          c,
        );
      if (e.openingObligation)
        flag(
          'OPENING_OBLIGATION_UNSUPPORTED',
          'New decisions cannot create past opening obligations. Put existing obligations in the baseline.',
          c,
          'unsupported',
        );
      if (c.decision === 'sales' && e.effect !== 'revenue')
        flag('TARGET_INVALID', 'A new sales item must be recognized revenue.', c);
      if (
        c.decision === 'hiring' &&
        (e.category !== 'payroll' ||
          e.effect !== 'operating_expense' ||
          e.driver.kind !== 'headcount')
      )
        flag(
          'HIRING_INPUTS',
          'Hiring needs explicit headcount and loaded monthly employee cost to calculate payroll and its cash impact.',
          c,
        );
      if (
        c.decision === 'hiring' &&
        e.driver.kind === 'headcount' &&
        (e.driver.count === null || e.driver.count === 0 || e.driver.monthlyCost === null)
      )
        flag(
          'HIRING_REQUIRED',
          'Supply a positive employee count and loaded monthly employee cost. No salary or revenue benefit will be invented.',
          c,
          'missing_required_input',
        );
      if (
        c.decision === 'spending' &&
        (e.effect !== 'operating_expense' || !costCategories.has(e.category))
      )
        flag(
          'SPENDING_TARGET',
          'Spending entries must be explicitly modeled operating costs; category and financial behavior are separate.',
          c,
        );
      if (c.decision === 'expansion' && !allowedExpansion.has(e.category))
        flag(
          'EXPANSION_UNSUPPORTED',
          'Expansion supports supplied investment, revenue, payroll, operating costs and related payments. Financing, tax and owner movements are not added automatically or through this decision.',
          c,
          'unsupported',
        );
      if (e.driver.kind === 'revenue_linked') {
        const baseComponent = e.driver.baseComponent;
        const provider = d.changes.find(
          (x) =>
            x.primitive.kind === 'entry' &&
            x.primitive.entry.componentKey === baseComponent &&
            x.primitive.entry.effect === 'revenue',
        );
        if (provider && !c.dependencies.includes(provider.id))
          flag(
            'DEPENDENCY_REQUIRED',
            'A cost linked to scenario-added revenue must explicitly depend on that revenue change.',
            c,
          );
      }
    }
  }
  const expansions = ordered.filter((c) => c.decision === 'expansion');
  if (expansions.length || d.type === 'expansion') {
    if (!d.expansion?.revenueMode || !d.expansion.note.trim())
      flag(
        'EXPANSION_REVENUE_REQUIRED',
        'Choose explicitly modeled expansion revenue or a cost-only analysis with revenue unknown, and explain that choice.',
        undefined,
        'missing_required_input',
      );
    if (!d.expansion?.costsReviewed)
      flag(
        'EXPANSION_COST_COVERAGE',
        'Review all material expansion costs, payroll, purchases and commitments, including items explicitly not applicable. Missing costs cannot be silently treated as zero.',
        undefined,
        'missing_required_input',
      );
    if (
      d.expansion?.revenueMode === 'modeled' &&
      !expansions.some(
        (c) => c.primitive.kind === 'entry' && c.primitive.entry.effect === 'revenue',
      )
    )
      flag(
        'EXPANSION_REVENUE_MISSING',
        'Expected expansion revenue is needed for a revenue-inclusive analysis. Supply an explicit revenue amount/ramp or select revenue unknown.',
        undefined,
        'missing_required_input',
      );
    if (
      d.expansion?.revenueMode === 'excluded_unknown' &&
      expansions.some((c) => c.primitive.kind === 'entry' && c.primitive.entry.effect === 'revenue')
    )
      flag(
        'EXPANSION_REVENUE_CONFLICT',
        'Revenue entries conflict with the cost-only, revenue-unknown declaration.',
      );
    if (
      !expansions.some(
        (c) =>
          c.primitive.kind === 'entry' &&
          c.primitive.entry.category === 'capex' &&
          c.primitive.entry.effect === 'cash_payment',
      )
    )
      flag(
        'INVESTMENT_REQUIRED',
        'Supply the expansion investment payment schedule, including an explicit zero if no capital spending is required.',
        undefined,
        'missing_required_input',
      );
  } else if (d.expansion)
    flag('EXPANSION_METADATA', 'Expansion assumptions require an expansion change.');
  const limitations = [
    'Scenario changes reference baseline amounts, not previous change results. Overlapping targets are rejected.',
    'No automatic financing, inventory, hiring productivity or marketing revenue benefit is inferred.',
    ...(d.expansion?.revenueMode === 'excluded_unknown'
      ? [
          'Cost-only expansion: additional revenue is unknown and excluded. This is not a complete profitability assessment.',
        ]
      : []),
  ];
  const addLineage = (e: PlanningEntry, c: ScenarioChange, baselineEntryId: string | null) =>
    lineage.push({
      entryId: e.id,
      baselineEntryId,
      changeId: c.id,
      sourceVersionId: versionId,
      confirmedBy: actor,
      confirmedAt,
      suppliedBy: suppliers[c.id] ?? actor,
    });
  if (!findings.length)
    try {
      for (const c of ordered) {
        const p = c.primitive;
        if (p.kind === 'entry') {
          input.entries.push(structuredClone(p.entry));
          addLineage(p.entry, c, null);
          continue;
        }
        const target = b.document.entries.find((e) => e.id === p.targetEntryId)!;
        // Split only affected baseline rows. Different non-overlapping changes can share a source row.
        const candidates = input.entries.filter(
          (e) =>
            lineage.find((l) => l.entryId === e.id)?.baselineEntryId === target.id &&
            !isCash(e.effect) &&
            e.start <= p.end &&
            e.end >= p.start,
        );
        for (const original of candidates) {
          input.entries = input.entries.filter((e) => e.id !== original.id);
          for (const month of monthsFrom(
            original.start,
            monthDistance(original.start, original.end) + 1,
          )) {
            const changed = month >= p.start && month <= p.end;
            const e: PlanningEntry = {
              ...structuredClone(original),
              id: derivedId(`${target.id}/${month}`),
              start: month,
              end: month,
              date: original.date,
            };
            if (changed) {
              const base = Money.parse(
                target.driver.kind === 'fixed' ? target.driver.amount! : '0',
                d.currency,
              );
              const value = p.value ?? '0';
              let next = base;
              if (p.operation === 'set') next = Money.parse(value, d.currency);
              if (p.operation === 'add') next = base.add(Money.parse(value, d.currency));
              if (p.operation === 'subtract') next = base.subtract(Money.parse(value, d.currency));
              if (p.operation === 'percentage_increase') next = base.add(base.multiply(value));
              if (p.operation === 'percentage_decrease') next = base.subtract(base.multiply(value));
              if (p.operation === 'remove') next = Money.parse('0', d.currency);
              if (next.compare(Money.parse('0', d.currency)) < 0) {
                flag(
                  'NEGATIVE_RESULT',
                  'The change would produce negative revenue or expense. Reduce the decrement or use an appropriate financial representation.',
                  c,
                );
                continue;
              }
              e.driver = { kind: 'fixed', amount: next.quantize() };
              e.source = c.source.kind;
              delete e.forecastRef;
              e.note = c.source.note;
              addLineage(e, c, target.id);
            } else {
              const old = lineage.find((l) => l.entryId === original.id)!;
              lineage.push({ ...old, entryId: e.id });
            }
            input.entries.push(e);
          }
        }
        if (target.cashTreatment.kind === 'explicit') {
          input.entries = input.entries.filter(
            (e) =>
              !(
                e.settles?.entryId === target.id &&
                e.settles.activityPeriod >= p.start &&
                e.settles.activityPeriod <= p.end
              ),
          );
          for (const [i, r] of (p.cashReplacement ?? []).entries()) {
            const e: PlanningEntry = {
              ...structuredClone(target),
              id: derivedId(`${c.id}/cash/${i}`),
              start: r.period,
              end: r.period,
              date: r.date,
              driver: { kind: 'fixed', amount: r.amount },
              effect: target.effect === 'revenue' ? 'cash_receipt' : 'cash_payment',
              source: c.source.kind,
              note: c.source.note,
              cashTreatment: { kind: 'not_modeled' },
              settles: {
                entryId: derivedId(`${target.id}/${r.activityPeriod}`),
                activityPeriod: r.activityPeriod,
              },
            };
            input.entries.push(e);
            addLineage(e, c, target.id);
          }
        }
      }
      // Retained explicit schedules point to the split activity for their original activity period.
      for (const e of input.entries)
        if (e.settles && !input.entries.some((x) => x.id === e.settles!.entryId)) {
          const match = input.entries.find(
            (x) =>
              lineage.find((l) => l.entryId === x.id)?.baselineEntryId === e.settles!.entryId &&
              !isCash(x.effect) &&
              x.start === e.settles!.activityPeriod,
          );
          if (match) e.settles.entryId = match.id;
        }
    } catch {
      flag(
        'VALUE_RANGE',
        'A scenario amount is outside the supported decimal range. Review the supplied amounts and proportions.',
      );
    }
  let financial: ScenarioReadiness['financial'] = null;
  if (!findings.length) {
    if (input.entries.length > 150)
      flag(
        'INPUT_LIMIT',
        'The transformed scenario exceeds the existing 150-input financial model limit. Reduce the number of distinct schedules.',
        undefined,
        'unsupported',
      );
    else {
      financial = evaluateCapabilities(input);
      for (const cap of financial.capabilities.filter((x) =>
        input.requestedOutputs.includes(x.capability),
      ))
        for (const f of cap.findings)
          flag(
            f.code,
            f.message,
            ordered.find((c) => c.id === lineage.find((l) => l.entryId === f.entryId)?.changeId),
            f.readiness,
          );
    }
  }
  const readiness: ScenarioReadiness['readiness'] = findings.some(
    (f) => f.readiness === 'unsupported',
  )
    ? 'unsupported'
    : findings.some((f) => f.readiness === 'invalid_conflicting_input')
      ? 'invalid_conflicting_input'
      : findings.length
        ? 'missing_required_input'
        : 'ready';
  const report: ScenarioReadiness = {
    readiness,
    executable: !findings.length,
    findings,
    financial,
    limitations,
    evidence: [...new Set(ordered.map((c) => c.source.kind))],
  };
  const activeIds = new Set(input.entries.map((e) => e.id));
  const finalLineage = [
    ...new Map(lineage.filter((l) => activeIds.has(l.entryId)).map((l) => [l.entryId, l])).values(),
  ];
  return { input, lineage: finalLineage, report };
}
export function evaluateScenario(b: BaselineSnapshot, d: ScenarioDocument): ScenarioReadiness {
  return transform(b, d, b.planningVersionId, b.actorId, b.confirmedAt, {}).report;
}
export function runScenario(s: ScenarioSnapshot): ScenarioResult {
  if (s.contractVersion !== SCENARIO_CONTRACT || s.scenarioEngineVersion !== SCENARIO_ENGINE)
    throw new Error('SCENARIO_VERSION_UNSUPPORTED');
  const { input, lineage, report } = transform(
    s.baseline,
    s.document,
    s.scenarioVersionId,
    s.confirmedBy,
    s.confirmedAt,
    s.suppliedBy,
  );
  if (!report.executable) throw new ScenarioBlocked(report);
  const baseline = calculateBaseline(s.baseline);
  const scenario = calculateBaseline({
    ...s.baseline,
    document: input,
    planningVersionId: s.scenarioVersionId,
    actorId: s.actorId,
    confirmedBy: s.confirmedBy,
    confirmedAt: s.confirmedAt,
    suppliedBy: Object.fromEntries(lineage.map((l) => [l.entryId, l.suppliedBy])),
  });
  // Financial formulas stay in M2. Restore mixed baseline/scenario provenance per output movement.
  for (const m of scenario.evidence) {
    const l = lineage.find((x) => x.entryId === m.entryId)!;
    m.sourceVersionId = l.sourceVersionId;
    m.confirmedBy = l.confirmedBy;
    m.confirmedAt = l.confirmedAt;
  }
  const currency = s.baseline.document.currency;
  const diff = (a: string | null, b: string | null): Difference => ({
    baseline: a,
    scenario: b,
    difference:
      a === null || b === null
        ? null
        : Money.parse(b, currency).subtract(Money.parse(a, currency)).quantize(),
  });
  for (const r of [baseline, scenario])
    for (const p of r.periods)
      if (
        p.closingCash !== null &&
        Money.parse(p.openingCash!, currency)
          .add(Money.parse(p.cashInflows!, currency))
          .subtract(Money.parse(p.cashOutflows!, currency))
          .quantize() !== p.closingCash
      )
        throw new Error('CASH_INVARIANT_FAILED');
  const periods = scenario.periods.map((p, i) => ({
    period: p.period,
    metrics: Object.fromEntries(
      comparisonMetrics.map((k) => [k, diff(baseline.periods[i][k], p[k])]),
    ) as Record<Metric, Difference>,
  }));
  const reserveAvailable = baseline.fundingGap !== null;
  const comparison = {
    periods,
    minimumCash: diff(baseline.minimumCash?.amount ?? null, scenario.minimumCash?.amount ?? null),
    fundingGap: diff(baseline.fundingGap, scenario.fundingGap),
    reserveBreach: {
      baseline: reserveAvailable ? baseline.firstReserveBreach !== null : null,
      scenario: reserveAvailable ? scenario.firstReserveBreach !== null : null,
    },
    firstReserveBreach: {
      baseline: baseline.firstReserveBreach,
      scenario: scenario.firstReserveBreach,
    },
    firstNegativePeriod: {
      baseline: baseline.firstNegativePeriod,
      scenario: scenario.firstNegativePeriod,
    },
  };
  let payback: ScenarioResult['payback'] = {
    status: 'unsupported',
    period: null,
    reason:
      'Not available with current inputs. Payback requires a pure expansion with explicit revenue, cash timing and investment, without independent decision effects.',
  };
  if (
    s.document.paybackRequested &&
    s.document.type === 'expansion' &&
    s.document.expansion?.revenueMode === 'modeled' &&
    input.requestedOutputs.includes('cash')
  ) {
    const capex = scenario.evidence.filter(
      (m) =>
        m.category === 'capex' &&
        m.effect === 'cash_payment' &&
        lineage.find((l) => l.entryId === m.entryId)?.changeId,
    );
    const first = capex.map((m) => m.period).sort()[0];
    if (
      capex.length &&
      capex.every((m) => m.period === first) &&
      capex.some((m) => Money.parse(m.amount, currency).compare(Money.parse('0', currency)) > 0)
    ) {
      let running = Money.parse('0', currency);
      const cumulative = periods.map((p) => {
        running = running.add(Money.parse(p.metrics.netCashMovement.difference!, currency));
        return { period: p.period, amount: running };
      });
      const negative = cumulative.findIndex(
        (p) => p.amount.compare(Money.parse('0', currency)) < 0,
      );
      if (negative >= 0) {
        const recovery = cumulative.findIndex(
          (p, i) =>
            i > negative &&
            p.amount.compare(Money.parse('0', currency)) >= 0 &&
            cumulative.slice(i).every((x) => x.amount.compare(Money.parse('0', currency)) >= 0),
        );
        payback = {
          status: recovery >= 0 ? 'supported' : 'not_reached',
          period: recovery >= 0 ? cumulative[recovery].period : null,
          reason:
            'Undiscounted recovery of cumulative incremental cash after an initial deficit, sustained to horizon end. It includes the supplied investment and modeled operating cash flows; no beyond-horizon benefits are inferred.',
        };
      } else
        payback.reason =
          'No modeled initial incremental cash deficit exists, so a recovery period is not defined.';
    } else
      payback.reason =
        'Not available with current inputs. M3 payback requires a positive investment paid in one month; staged or missing investment is not supported.';
  }
  const { document, baseline: baselineInput, ...manifest } = s;
  void document;
  return {
    manifest: {
      ...manifest,
      workspaceId: baselineInput.workspaceId,
      baselineVersionId: baselineInput.baselineVersionId,
      planningVersionId: baselineInput.planningVersionId,
      financialEngineVersion: baselineInput.engineVersion,
      roundingPolicyVersion: baselineInput.roundingPolicyVersion,
      reservePolicyVersionId: baselineInput.reservePolicy?.id ?? null,
      currency,
    },
    changes: s.document.changes,
    readiness: report,
    modifiedInputs: input,
    lineage,
    baseline,
    scenario,
    comparison,
    payback,
    breakEven: {
      status: 'unsupported',
      amount: null,
      reason:
        'Not available with current inputs. A validated unit-volume, selling-price and contribution-margin structure is not supplied by the M3 scenario contract.',
    },
  };
}
