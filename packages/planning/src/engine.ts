import { Money, ROUNDING_POLICY, timingSchema } from '../../contracts/src/index.js';
import {
  ENGINE_VERSION,
  PLANNING_CONTRACT,
  planningDocumentSchema,
  monthsFrom,
  monthDistance,
  isCash,
  type PlanningDocument,
  type PlanningEntry,
  type Finding,
  type CapabilityName,
  type CapabilityReport,
  type BaselineSnapshot,
  type BaselineResult,
  type Movement,
  type PeriodResult,
} from './model.js';

/** All IO, persistence and authorization are outside this module. */
export class PlanningBlocked extends Error {
  constructor(readonly report: CapabilityReport) {
    super('CAPABILITY_BLOCKED');
  }
}
const operationCategories = new Set([
  'payroll',
  'rent',
  'marketing',
  'software',
  'utilities',
  'fees',
  'cost_of_sales',
  'other_operating',
  'depreciation',
  'noncash',
]);
function compatibleEffect(e: PlanningEntry): boolean {
  if (e.effect === 'restricted_release') return e.category === 'restricted_release';
  if (e.effect === 'revenue') return e.category === 'revenue';
  if (e.effect === 'revenue_reduction') return e.category === 'refunds';
  if (e.effect === 'operating_expense') return operationCategories.has(e.category);
  if (e.effect === 'non_operating_expense') return ['debt_interest', 'tax'].includes(e.category);
  if (e.effect === 'cash_receipt')
    return [
      'revenue',
      'known_receipt',
      'financing',
      'owner_contribution',
      'net_settlement',
    ].includes(e.category);
  return ![
    'revenue',
    'known_receipt',
    'financing',
    'owner_contribution',
    'net_settlement',
    'restricted_release',
    'depreciation',
    'noncash',
  ].includes(e.category);
}
type Compile = { movements: Movement[]; report: CapabilityReport };
function compile(
  d: PlanningDocument,
  versionId: string,
  actorId: string,
  confirmedAt: string,
): Compile {
  const findings: Finding[] = [];
  const movements: Movement[] = [];
  const zero = () => Money.parse('0', d.currency);
  const flag = (
    code: string,
    message: string,
    targets: CapabilityName[],
    entry?: PlanningEntry,
    readiness: Finding['readiness'] = 'invalid_conflicting_input',
    sources: Finding['requirement']['permittedSources'] = ['observed', 'schedule', 'assumption'],
  ) => {
    for (const capability of targets)
      findings.push({
        code,
        message,
        capability,
        readiness,
        ...(entry ? { entryId: entry.id } : {}),
        requirement: {
          necessity: 'required',
          permittedSources: sources,
          target: entry?.componentKey ?? code,
        },
      });
  };
  const both: CapabilityName[] = ['operating', 'cash'];
  const end = monthsFrom(d.projectionStart, d.horizonMonths).at(-1)!;
  const validEntries: PlanningEntry[] = [];
  const ids = new Set<string>();
  for (const e of d.entries) {
    let structural = false;
    if (ids.has(e.id)) {
      flag('DUPLICATE_ENTRY', 'An entry identifier appears more than once.', both, e);
      structural = true;
    }
    ids.add(e.id);
    if (e.currency !== d.currency) {
      flag(
        'CURRENCY_MISMATCH',
        'All inputs must use the workspace base currency; no exchange conversion is applied.',
        both,
        e,
      );
      structural = true;
    }
    if (e.scope.kind !== 'company') {
      flag(
        'SCOPE_UNSUPPORTED',
        'M2 calculates company-level planning only. Aggregate or supply company inputs explicitly.',
        both,
        e,
        'unsupported',
      );
      structural = true;
    }
    if (
      e.source === 'forecast' &&
      (!e.forecastRef ||
        e.start !== e.end ||
        e.start !== e.forecastRef.period ||
        e.driver.kind !== 'fixed')
    ) {
      flag(
        'FORECAST_NOT_IMPLEMENTED',
        'Statistical forecasts are unavailable. Supply a known schedule or explicit assumption.',
        both,
        e,
        'unsupported',
        ['schedule', 'assumption'],
      );
      structural = true;
    }
    if (
      e.end < e.start ||
      e.start < d.projectionStart ||
      monthDistance(d.projectionStart, e.end) > d.horizonMonths + 120
    ) {
      flag(
        'PERIOD_INVALID',
        'Events must begin at or after projection start and remain within the supported horizon plus 120 tail months.',
        both,
        e,
      );
      structural = true;
    }
    if (e.date && (e.start !== e.end || e.date.slice(0, 7) !== e.start)) {
      flag('DATE_PERIOD_CONFLICT', 'A dated event must be in its single declared month.', both, e);
      structural = true;
    }
    if (!compatibleEffect(e)) {
      flag(
        'BASIS_CATEGORY_CONFLICT',
        'This financial category cannot have the selected financial effect.',
        both,
        e,
      );
      structural = true;
    }
    if (
      e.openingObligation &&
      (!isCash(e.effect) || e.effect === 'restricted_release' || e.settles)
    ) {
      flag(
        'OPENING_OBLIGATION_CONFLICT',
        'Opening obligations are separate cash schedules, not new recognized activity or settlements of newly modeled activity.',
        both,
        e,
      );
      structural = true;
    }
    if (isCash(e.effect) && e.driver.kind !== 'fixed') {
      flag(
        'CASH_DRIVER_UNSUPPORTED',
        'Supply explicit cash amounts; apply drivers to recognized activity first.',
        both,
        e,
        'unsupported',
      );
      structural = true;
    }
    if (
      e.driver.kind === 'headcount' &&
      (e.category !== 'payroll' || e.effect !== 'operating_expense')
    ) {
      flag(
        'PAYROLL_TARGET_INVALID',
        'Headcount behavior applies to payroll operating expense.',
        both,
        e,
      );
      structural = true;
    }
    if (e.driver.kind === 'revenue_linked' && e.effect !== 'operating_expense') {
      flag(
        'LINKED_TARGET_INVALID',
        'Revenue-linked behavior is supported for operating costs only.',
        both,
        e,
      );
      structural = true;
    }
    if (!structural) validEntries.push(e);
  }
  if (!d.coverage.revenueComplete)
    flag(
      'REVENUE_COVERAGE_REQUIRED',
      'Confirm that modeled revenue covers this horizon, including any months with no revenue. Missing revenue is not assumed to be zero.',
      ['operating'],
      undefined,
      'missing_required_input',
    );
  if (!d.coverage.expensesComplete)
    flag(
      'EXPENSE_COVERAGE_REQUIRED',
      'Confirm that all material operating costs are represented, including explicit no-cost months.',
      ['operating'],
      undefined,
      'missing_required_input',
    );
  if (!d.coverage.cashComplete)
    flag(
      'CASH_COVERAGE_REQUIRED',
      'Confirm coverage of material receipts, payments, purchases, existing obligations, taxes and financing for this horizon.',
      ['cash'],
      undefined,
      'missing_required_input',
    );
  if (!d.openingCash || d.openingCash.available === null)
    flag(
      'OPENING_CASH_REQUIRED',
      'Opening available cash is required to calculate projected cash balances and funding gaps.',
      ['cash'],
      undefined,
      'missing_required_input',
      ['observed', 'assumption'],
    );
  if (d.openingCash && d.openingCash.asOf !== `${d.projectionStart}-01`)
    flag(
      'OPENING_CASH_DATE',
      'Opening cash must be the balance immediately before activity on the first day of projection start.',
      ['cash'],
    );
  if (
    d.coverage.depreciation === 'included' &&
    !d.entries.some((e) => e.category === 'depreciation' && e.effect === 'operating_expense')
  )
    flag(
      'DEPRECIATION_MISSING',
      'Depreciation is marked included but no explicit depreciation amount was supplied.',
      ['operating'],
      undefined,
      'missing_required_input',
    );
  if (
    d.coverage.depreciation !== 'included' &&
    d.entries.some((e) => e.category === 'depreciation' && e.effect === 'operating_expense')
  )
    flag(
      'DEPRECIATION_CONFLICT',
      'Supplied depreciation conflicts with the selected depreciation coverage.',
      ['operating'],
    );
  if (
    d.coverage.revenueConvention === 'net_of_refunds' &&
    d.entries.some((e) => e.effect === 'revenue_reduction')
  )
    flag(
      'REFUND_DOUBLE_COUNT',
      'Revenue is already net of refunds. Remove a duplicate recognized refund or select gross revenue.',
      ['operating'],
    );
  const emit = (
    e: PlanningEntry,
    period: string,
    amount: string,
    effect = e.effect,
    activityPeriod = period,
    transformation = 'Explicit period amount',
    parents: string[] = [],
  ): Movement => {
    const m: Movement = {
      id: `${e.id}:${effect}:${period}:${activityPeriod}:${movements.length}`,
      entryId: e.id,
      componentKey: e.componentKey,
      label: e.label,
      category: e.category,
      effect,
      period,
      activityPeriod,
      date: e.date,
      amount,
      source: e.source,
      sourceVersionId: versionId,
      confirmedBy: actorId,
      confirmedAt,
      note: e.note,
      behavior: e.driver.kind,
      transformation,
      parentEntryIds: parents,
      committed: e.committed,
      openingObligation: e.openingObligation,
    };
    movements.push(m);
    return m;
  };
  function direct(e: PlanningEntry) {
    if (e.driver.kind === 'revenue_linked') return;
    if (e.driver.kind === 'fixed' && e.driver.amount === null) {
      flag(
        'AMOUNT_REQUIRED',
        `${e.label}: supply a monetary value or explicit assumption.`,
        isCash(e.effect) ? ['cash'] : both,
        e,
        'missing_required_input',
      );
      return;
    }
    if (
      e.driver.kind === 'headcount' &&
      (e.driver.count === null || e.driver.monthlyCost === null)
    ) {
      flag(
        'PAYROLL_INPUT_REQUIRED',
        'Payroll requires headcount and fully loaded monthly cost; an explicit estimate is permitted.',
        both,
        e,
        'missing_required_input',
      );
      return;
    }
    for (const [i, period] of monthsFrom(e.start, monthDistance(e.start, e.end) + 1).entries()) {
      let amount: Money;
      if (e.driver.kind === 'fixed') amount = Money.parse(e.driver.amount!, d.currency);
      else {
        amount = Money.parse(e.driver.monthlyCost!, d.currency).multiply(String(e.driver.count));
        if (i === 0 && e.driver.onboardingCost !== null)
          amount = amount.add(Money.parse(e.driver.onboardingCost, d.currency));
      }
      emit(
        e,
        period,
        amount.quantize(),
        e.effect,
        period,
        e.driver.kind === 'headcount'
          ? `Headcount × loaded monthly cost${i === 0 && e.driver.onboardingCost !== null ? ' + explicit total onboarding cost' : ''}`
          : 'Explicit amount for this month',
      );
    }
  }
  try {
    for (const e of validEntries) direct(e);
    for (const e of validEntries.filter((e) => e.driver.kind === 'revenue_linked')) {
      if (e.driver.kind !== 'revenue_linked') continue;
      if (e.driver.rate === null) {
        flag(
          'RATE_REQUIRED',
          'Supply an explicit proportional cost rate.',
          both,
          e,
          'missing_required_input',
        );
        continue;
      }
      if (e.driver.rate.startsWith('-')) {
        flag('RATE_INVALID', 'Cost rates cannot be negative.', both, e);
        continue;
      }
      for (const period of monthsFrom(e.start, monthDistance(e.start, e.end) + 1)) {
        const base = movements.filter(
          (m) =>
            m.componentKey === (e.driver.kind === 'revenue_linked' ? e.driver.baseComponent : '') &&
            m.effect === 'revenue' &&
            m.period === period,
        );
        if (base.length !== 1) {
          flag(
            'REVENUE_BASE_REQUIRED',
            `Provide exactly one revenue source for the linked cost in ${period}.`,
            both,
            e,
            'missing_required_input',
          );
          continue;
        }
        emit(
          e,
          period,
          Money.parse(base[0].amount, d.currency).multiply(e.driver.rate).quantize(),
          e.effect,
          period,
          'Confirmed revenue base × confirmed rate',
          [base[0].entryId],
        );
      }
    }
  } catch {
    flag('MONEY_RANGE', 'An amount or derived amount exceeds the supported monetary range.', both);
  }
  const seen = new Set<string>();
  for (const m of movements) {
    const key = `${m.componentKey}/${m.period}/${m.effect}`;
    if (seen.has(key))
      flag(
        'SOURCE_CONFLICT',
        `More than one source supplies ${m.componentKey} (${m.effect}) in ${m.period}. Resolve the overlap; no source is silently preferred.`,
        isCash(m.effect) ? ['cash'] : both,
        validEntries.find((e) => e.id === m.entryId),
      );
    seen.add(key);
  }
  const activities = movements.filter((m) => !isCash(m.effect));
  for (const activity of activities) {
    const e = validEntries.find((x) => x.id === activity.entryId)!;
    const treatment = e.cashTreatment;
    if (treatment.kind === 'not_modeled') {
      flag(
        'TIMING_REQUIRED',
        `${e.label}: specify collection/payment timing, matched cash schedules, or an applicable non-cash treatment.`,
        ['cash'],
        e,
        'missing_required_input',
        ['schedule', 'assumption'],
      );
      continue;
    }
    if (treatment.kind === 'non_cash') {
      if (!['depreciation', 'noncash', 'cost_of_sales'].includes(e.category))
        flag(
          'NONCASH_UNSUPPORTED',
          'Only explicit depreciation, non-cash expenses and cost of sales can use non-cash treatment; ordinary sales/costs require timing.',
          ['cash'],
          e,
          'unsupported',
        );
      if (
        e.category === 'cost_of_sales' &&
        !validEntries.some((x) => x.category === 'purchases' && x.effect === 'cash_payment')
      )
        flag(
          'PURCHASING_SCHEDULE_REQUIRED',
          'Cost of sales does not specify inventory cash needs. Supply a purchasing/payment schedule, including an explicit zero if appropriate.',
          ['cash'],
          e,
          'missing_required_input',
          ['schedule', 'assumption'],
        );
      continue;
    }
    if (treatment.kind === 'included_in_net') {
      if (e.category !== 'fees' || d.coverage.settlementConvention !== 'net')
        flag(
          'NET_TREATMENT_CONFLICT',
          'Only fees already deducted in explicitly supplied net settlements can use this treatment.',
          ['cash'],
          e,
        );
      if (!validEntries.some((x) => x.category === 'net_settlement' && x.effect === 'cash_receipt'))
        flag(
          'NET_SETTLEMENT_REQUIRED',
          'Supply the actual expected net receipt schedule.',
          ['cash'],
          e,
          'missing_required_input',
        );
      continue;
    }
    if (['depreciation', 'noncash', 'cost_of_sales'].includes(e.category)) {
      flag(
        'TIMING_BASIS_INVALID',
        'This cost is not a payment base. Use explicit non-cash treatment; supply purchasing payments separately where relevant.',
        ['cash'],
        e,
      );
      continue;
    }
    if (treatment.kind === 'explicit') {
      if (d.coverage.settlementConvention === 'net' && e.effect === 'revenue') {
        if (
          !validEntries.some((x) => x.category === 'net_settlement' && x.effect === 'cash_receipt')
        )
          flag(
            'NET_SETTLEMENT_REQUIRED',
            'Net revenue settlements require an explicit net-receipt schedule.',
            ['cash'],
            e,
            'missing_required_input',
          );
        continue; // Completeness of deductions is explicit in coverage, never inferred from gross revenue.
      }
      const expectedEffect = activity.effect === 'revenue' ? 'cash_receipt' : 'cash_payment';
      const linked = validEntries.filter(
        (x) => x.settles?.entryId === e.id && x.settles.activityPeriod === activity.period,
      );
      const cash = movements.filter(
        (m) => linked.some((x) => x.id === m.entryId) && m.effect === expectedEffect,
      );
      const total = cash.reduce((a, b) => a.add(Money.parse(b.amount, d.currency)), zero());
      if (cash.length === 0 || total.compare(Money.parse(activity.amount, d.currency)) !== 0)
        flag(
          'CASH_SCHEDULE_INCOMPLETE',
          `${e.label} in ${activity.period}: linked cash schedules must account for the whole modeled amount, including payments beyond the horizon.`,
          ['cash'],
          e,
          'missing_required_input',
        );
    } else {
      const check = timingSchema.safeParse({
        componentId: e.id,
        basis: e.effect === 'revenue' ? 'revenue' : 'expense',
        buckets: treatment.buckets,
        source: { kind: 'assumption', versionId, confirmed: true },
      });
      if (
        !check.success ||
        new Set(treatment.buckets.map((b) => b.offsetMonths)).size !== treatment.buckets.length
      ) {
        flag(
          'TIMING_INCOMPLETE',
          'Timing proportions must be nonnegative, total exactly 1, and have unique month offsets.',
          ['cash'],
          e,
        );
        continue;
      }
      const ordered = [...treatment.buckets].sort((a, b) => a.offsetMonths - b.offsetMonths);
      const allocated = Money.parse(activity.amount, d.currency).allocate(
        ordered.map((b) => b.proportion),
      );
      ordered.forEach((bucket, i) =>
        emit(
          e,
          monthsFrom(activity.period, bucket.offsetMonths + 1).at(-1)!,
          allocated[i],
          e.effect === 'revenue' ? 'cash_receipt' : 'cash_payment',
          activity.period,
          `Confirmed timing: offset ${bucket.offsetMonths} month(s), proportion ${bucket.proportion}; ${ROUNDING_POLICY}`,
          [e.id],
        ),
      );
    }
  }
  for (const e of validEntries.filter((e) => isCash(e.effect) && e.settles)) {
    const target = validEntries.find((x) => x.id === e.settles!.entryId);
    if (
      !target ||
      isCash(target.effect) ||
      target.cashTreatment.kind !== 'explicit' ||
      e.componentKey !== target.componentKey ||
      e.settles!.activityPeriod < target.start ||
      e.settles!.activityPeriod > target.end ||
      e.effect !== (target.effect === 'revenue' ? 'cash_receipt' : 'cash_payment')
    )
      flag(
        'SETTLEMENT_CONFLICT',
        'A linked cash schedule must match an explicitly settled activity, its component, period and receipt/payment direction.',
        ['cash'],
        e,
      );
  }
  const generated = movements.filter((m) => isCash(m.effect) && m.parentEntryIds.length > 0);
  for (const m of generated)
    if (
      validEntries.some(
        (e) =>
          isCash(e.effect) &&
          e.componentKey === m.componentKey &&
          e.start <= m.period &&
          e.end >= m.period,
      )
    )
      flag(
        'CASH_DOUBLE_COUNT',
        'An explicit cash schedule overlaps generated timing for the same component. Choose one representation.',
        ['cash'],
        validEntries.find((e) => e.id === m.entryId),
      );
  if (d.coverage.settlementConvention === 'net') {
    if (
      validEntries.some(
        (e) =>
          (e.effect === 'revenue' && e.cashTreatment.kind === 'profile') ||
          (e.category === 'revenue' && e.effect === 'cash_receipt') ||
          (e.category === 'fees' &&
            (e.effect === 'cash_payment' ||
              (e.effect === 'operating_expense' && e.cashTreatment.kind !== 'included_in_net'))),
      )
    )
      flag(
        'NET_SETTLEMENT_DOUBLE_COUNT',
        'Net-settlement mode excludes gross sales receipts and separate fee cash deductions. Supply net receipts once; retain fees only as recognized expenses included in net settlements.',
        ['cash'],
      );
  } else if (validEntries.some((e) => e.category === 'net_settlement'))
    flag(
      'NET_SETTLEMENT_CONFLICT',
      'Net receipt schedules require the explicit net-settlement convention.',
      ['cash'],
    );
  const releases = movements.filter((m) => m.effect === 'restricted_release');
  if (releases.length) {
    if (d.openingCash?.restricted === null || d.openingCash?.restricted === undefined)
      flag(
        'RESTRICTED_CASH_REQUIRED',
        'Supply opening restricted cash before modeling its release.',
        ['cash'],
        undefined,
        'missing_required_input',
      );
    else if (
      releases
        .reduce((a, b) => a.add(Money.parse(b.amount, d.currency)), zero())
        .compare(Money.parse(d.openingCash.restricted, d.currency)) > 0
    )
      flag(
        'RESTRICTED_RELEASE_EXCEEDED',
        'Releases exceed the supplied opening restricted cash balance.',
        ['cash'],
      );
  }
  const evidence: string[] = [
    ...new Set(
      d.entries.map((e) =>
        e.source === 'schedule'
          ? 'scheduled'
          : e.source === 'assumption'
            ? 'assumption_led'
            : e.source === 'forecast' && e.forecastRef
              ? 'forecast_supported'
              : 'observed',
      ),
    ),
  ];
  if (d.openingCash)
    evidence.push(d.openingCash.source === 'assumption' ? 'assumption_led' : 'observed');
  const tags = [...new Set(evidence)];
  if (tags.length > 1) tags.push('mixed_hybrid');
  const capabilities = (['operating', 'cash'] as const).map((capability) => {
    const own = findings.filter((f) => f.capability === capability);
    const readiness: CapabilityReport['capabilities'][number]['readiness'] = own.some(
      (f) => f.readiness === 'unsupported',
    )
      ? 'unsupported'
      : own.some((f) => f.readiness === 'invalid_conflicting_input')
        ? 'invalid_conflicting_input'
        : own.length
          ? 'missing_required_input'
          : 'ready';
    return { capability, readiness, evidence: tags.length ? tags : ['limited'], findings: own };
  });
  const limitations = [
    'Monthly balances do not establish within-month liquidity.',
    'Operating Result excludes financing interest and corporate tax; it is not Net Profit.',
    ...(d.coverage.depreciation === 'excluded'
      ? ['Operating Result excludes depreciation because it was not supplied.']
      : []),
    ...(d.coverage.settlementConvention === 'net'
      ? [
          'Net receipt schedules are explicitly supplied; gross-to-net reconciliation is not inferred.',
        ]
      : []),
    ...(movements.some((m) => m.period > end)
      ? ['Beyond-horizon movements are preserved and excluded from the displayed horizon totals.']
      : []),
  ];
  return {
    movements,
    report: {
      capabilities,
      executable: d.requestedOutputs.every(
        (x) => capabilities.find((c) => c.capability === x)!.readiness === 'ready',
      ),
      requestedOutputs: d.requestedOutputs,
      limitations,
    },
  };
}
const evidenceVersion = '00000000-0000-4000-8000-000000000001';
export function evaluateCapabilities(input: PlanningDocument): CapabilityReport {
  const d = planningDocumentSchema.parse(input);
  return compile(d, evidenceVersion, evidenceVersion, '1970-01-01T00:00:00.000Z').report;
}

export function calculateBaseline(snapshot: BaselineSnapshot): BaselineResult {
  if (
    snapshot.engineVersion !== ENGINE_VERSION ||
    snapshot.roundingPolicyVersion !== ROUNDING_POLICY ||
    snapshot.contractVersion !== PLANNING_CONTRACT
  )
    throw new Error('ENGINE_VERSION_UNSUPPORTED');
  const d = planningDocumentSchema.parse(snapshot.document);
  const { movements, report } = compile(
    d,
    snapshot.planningVersionId,
    snapshot.confirmedBy,
    snapshot.confirmedAt,
  );
  if (!report.executable) throw new PlanningBlocked(report);
  const zero = () => Money.parse('0', d.currency);
  const sum = (items: Movement[]) =>
    items.reduce((a, m) => a.add(Money.parse(m.amount, d.currency)), zero());
  const cash = d.requestedOutputs.includes('cash'),
    operating = d.requestedOutputs.includes('operating');
  let balance = cash
    ? Money.parse(Money.parse(d.openingCash!.available!, d.currency).quantize(), d.currency)
    : zero();
  let restricted = Money.parse(
    Money.parse(d.openingCash?.restricted ?? '0', d.currency).quantize(),
    d.currency,
  );
  const periodList = monthsFrom(d.projectionStart, d.horizonMonths);
  const end = periodList.at(-1)!;
  const periods: PeriodResult[] = periodList.map((period, index) => {
    const all = movements.filter((m) => m.period === period);
    const revenue = all.filter((m) => m.effect === 'revenue');
    const reductions = all.filter((m) => m.effect === 'revenue_reduction');
    const expenses = all.filter((m) => m.effect === 'operating_expense');
    const ins = all.filter((m) => m.effect === 'cash_receipt' || m.effect === 'restricted_release');
    const outs = all.filter((m) => m.effect === 'cash_payment');
    const opening = balance.quantize();
    if (cash) {
      balance = balance.add(sum(ins)).subtract(sum(outs));
      restricted = restricted.subtract(sum(all.filter((m) => m.effect === 'restricted_release')));
    }
    const rev = sum(revenue).subtract(sum(reductions));
    const op = sum(expenses);
    return {
      period,
      revenue: operating ? rev.quantize() : null,
      operatingExpenses: operating ? op.quantize() : null,
      operatingResult: operating ? rev.subtract(op).quantize() : null,
      nonOperatingExpenses: operating
        ? sum(all.filter((m) => m.effect === 'non_operating_expense')).quantize()
        : null,
      openingCash: cash ? opening : null,
      cashInflows: cash ? sum(ins).quantize() : null,
      cashOutflows: cash ? sum(outs).quantize() : null,
      netCashMovement: cash ? sum(ins).subtract(sum(outs)).quantize() : null,
      closingCash: cash ? balance.quantize() : null,
      restrictedCash: cash && d.openingCash?.restricted !== null ? restricted.quantize() : null,
      evidence: {
        revenue: [...revenue, ...reductions].map((m) => m.id),
        operatingExpenses: expenses.map((m) => m.id),
        cashInflows: ins.map((m) => m.id),
        cashOutflows: outs.map((m) => m.id),
        openingCashFrom: index === 0 ? 'opening_cash' : periodList[index - 1],
      },
    };
  });
  let minimum: BaselineResult['minimumCash'] = null,
    firstNegative: string | null = null,
    firstBreach: string | null = null,
    gap = zero();
  const reserve =
    snapshot.reservePolicy?.minimum !== null && snapshot.reservePolicy?.minimum !== undefined
      ? Money.parse(snapshot.reservePolicy.minimum, d.currency)
      : null;
  for (const p of periods)
    if (cash) {
      const closing = Money.parse(p.closingCash!, d.currency);
      if (!minimum || closing.compare(Money.parse(minimum.amount, d.currency)) < 0)
        minimum = { period: p.period, amount: p.closingCash! };
      if (!firstNegative && closing.compare(zero()) < 0) firstNegative = p.period;
      if (reserve) {
        const shortfall = reserve.subtract(closing);
        if (shortfall.compare(gap) > 0) gap = shortfall;
        if (!firstBreach && closing.compare(reserve) < 0) firstBreach = p.period;
      }
    }
  const commitments = movements.filter((m) => m.committed && m.period <= end);
  const { document: inputDocument, ...manifest } = snapshot;
  void inputDocument;
  return {
    contractVersion: PLANNING_CONTRACT,
    engineVersion: ENGINE_VERSION,
    currency: d.currency,
    capabilities: report,
    periods,
    minimumCash: minimum,
    firstNegativePeriod: firstNegative,
    firstReserveBreach: firstBreach,
    fundingGap: cash && reserve ? gap.quantize() : null,
    reservePolicy: snapshot.reservePolicy,
    commitments: {
      recognizedTotal: sum(
        commitments.filter(
          (m) => m.effect === 'operating_expense' || m.effect === 'non_operating_expense',
        ),
      ).quantize(),
      cashPaymentsTotal: sum(commitments.filter((m) => m.effect === 'cash_payment')).quantize(),
      cashReceiptsTotal: sum(commitments.filter((m) => m.effect === 'cash_receipt')).quantize(),
      movementIds: commitments.map((m) => m.id),
    },
    tailMovements: movements.filter((m) => m.period > end),
    evidence: movements,
    openingCashEvidence: d.openingCash,
    manifest,
    limitations: report.limitations,
  };
}
