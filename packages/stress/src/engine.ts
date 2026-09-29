import { Money } from '../../contracts/src/index.js';
import { calculateBaseline } from '../../planning/src/engine.js';
import {
  monthsFrom,
  monthDistance,
  planningDocumentSchema,
  type BaselineResult,
  type BaselineSnapshot,
} from '../../planning/src/model.js';
import { runScenario, derivedId } from '../../scenarios/src/engine.js';
import {
  SCENARIO_CONTRACT,
  SCENARIO_ENGINE,
  type ScenarioChange,
} from '../../scenarios/src/model.js';
import {
  definitionSchema,
  STRESS_VERSION,
  type Definition,
  type Source,
  type Policy,
  type PolicyInput,
  type Rule,
  type Risk,
  type Finding,
  type RunRef,
  type StressOutcome,
  type Comparison,
  type Brief,
  type Option,
} from './model.js';
export class StressInvalid extends Error {}
export function rules(input: PolicyInput): Rule[] {
  const base = {
    version: '1' as const,
    comparison: 'lt' as const,
    source: input.source,
    scope: 'company' as const,
  };
  return [
    ...(input.negativeCash
      ? [
          {
            ...base,
            id: 'cash_negative',
            metric: 'closingCash' as const,
            threshold: '0',
            severity: 'critical' as const,
          },
        ]
      : []),
    ...(input.minimumCash !== null
      ? [
          {
            ...base,
            id: 'cash_reserve',
            metric: 'closingCash' as const,
            threshold: input.minimumCash,
            severity: 'warning' as const,
          },
        ]
      : []),
    ...(input.minimumOperatingResult !== null
      ? [
          {
            ...base,
            id: 'operating_floor',
            metric: 'operatingResult' as const,
            threshold: input.minimumOperatingResult,
            severity: 'attention' as const,
          },
        ]
      : []),
  ];
}
export function evaluateRisk(financial: BaselineResult, policy: Policy, run: RunRef): Risk {
  if (financial.currency !== policy.currency)
    throw new StressInvalid('Risk policy currency must match the calculated result.');
  const findings: Finding[] = [],
    checks: Risk['checks'] = [];
  for (const rule of policy.rules) {
    const values = financial.periods.map((p, i) => ({
      period: p.period,
      value: p[rule.metric],
      path: `periods[${i}].${rule.metric}`,
    }));
    let episode: typeof values = [];
    let breached = 0;
    const close = (next: (typeof values)[number] | undefined) => {
      if (!episode.length) return;
      const first = episode[0],
        last = episode.at(-1)!;
      findings.push({
        id: derivedId(`${policy.id}/${run.kind}/${run.id}/${rule.id}/${first.period}`),
        ruleId: rule.id,
        ruleVersion: rule.version,
        policyId: policy.id,
        severity: rule.severity,
        metric: rule.metric,
        threshold: rule.threshold,
        comparison: 'lt',
        firstPeriod: first.period,
        lastPeriod: last.period,
        durationMonths: episode.length,
        recoveryPeriod: next?.value !== null && next ? next.period : null,
        recovery: !next ? 'not_observed' : next.value === null ? 'unknown' : 'within_horizon',
        run,
        template: 'threshold_breach_v1',
        explanation: `${rule.metric === 'closingCash' ? 'Projected closing cash' : 'Operating result'} is below the declared ${financial.currency} ${rule.threshold} threshold from ${first.period} through ${last.period}.`,
        evidence: episode.map((p) => ({ ...p, value: p.value! })),
      });
      episode = [];
    };
    for (const value of values) {
      if (
        value.value !== null &&
        Money.parse(value.value, financial.currency).compare(
          Money.parse(rule.threshold, financial.currency),
        ) < 0
      ) {
        episode.push(value);
        breached++;
      } else close(value);
    }
    close(undefined);
    checks.push({
      ruleId: rule.id,
      status: values.some((p) => p.value === null) ? 'unavailable' : breached ? 'breached' : 'met',
      firstBreach:
        values.find(
          (p) =>
            p.value !== null &&
            Money.parse(p.value, financial.currency).compare(
              Money.parse(rule.threshold, financial.currency),
            ) < 0,
        )?.period ?? null,
      breachPeriods: breached,
      values,
    });
  }
  return {
    policyId: policy.id,
    findings,
    checks,
    unsupported: [
      'Runway and unit break-even are unavailable under the existing financial contract.',
      'Stress payback is not inferred. Existing scenario payback, when supported, remains source-run evidence only.',
    ],
  };
}
export function stressInputs(
  source: Source,
  raw: Definition,
  id: string,
): { snapshot: BaselineSnapshot; lineage: StressOutcome['lineage'] } {
  const d = definitionSchema.parse(raw),
    s = source.snapshot,
    periods = monthsFrom(s.document.projectionStart, s.document.horizonMonths),
    seen = new Set<string>(),
    keys = new Set<string>();
  if (d.source.kind !== source.ref.kind || d.source.runId !== source.ref.runId)
    throw new StressInvalid('Stress definition must reference the pinned source run.');
  if (!d.modifications.length && d.template !== 'zero')
    throw new StressInvalid(
      'Add supported modifications or explicitly select the zero-stress reference.',
    );
  if (d.template === 'zero' && d.modifications.length)
    throw new StressInvalid('A zero-stress reference cannot contain modifications.');
  for (const m of d.modifications) {
    const target = s.document.entries.find((e) => e.id === m.targetEntryId);
    if (!target)
      throw new StressInvalid('A stress target does not exist in the pinned source inputs.');
    if (seen.has(m.id) || m.dependencies.some((x) => !seen.has(x)))
      throw new StressInvalid('Dependencies must reference distinct earlier modifications.');
    seen.add(m.id);
    if (
      m.start > m.end ||
      !periods.includes(m.start) ||
      !periods.includes(m.end) ||
      m.start < target.start ||
      m.end > target.end
    )
      throw new StressInvalid('Stress months must be inside the source horizon and target range.');
    if (target.driver.kind !== 'fixed' || target.driver.amount === null)
      throw new StressInvalid(
        'Stress targets require existing fixed amounts; headcount and derived drivers are not overwritten.',
      );
    if (
      (m.kind === 'expense_increase' && target.effect !== 'operating_expense') ||
      (m.kind !== 'expense_increase' && target.effect !== 'revenue')
    )
      throw new StressInvalid('Stress type does not match the target financial effect.');
    if (m.kind === 'collection_delay') {
      if (
        m.delayMonths === null ||
        m.rate !== null ||
        target.cashTreatment.kind !== 'profile' ||
        s.document.coverage.settlementConvention === 'net'
      )
        throw new StressInvalid(
          'Collection delay requires a gross-receipt timing profile and an explicit month offset.',
        );
    } else if (m.rate === null || m.delayMonths !== null)
      throw new StressInvalid('Amount stress requires an explicit proportional rate.');
    for (const period of monthsFrom(m.start, monthDistance(m.start, m.end) + 1)) {
      const key = `${m.targetEntryId}/${m.kind === 'collection_delay' ? 'timing' : 'amount'}/${period}`;
      if (keys.has(key))
        throw new StressInvalid(
          'Overlapping modifications cannot compound or double count the same driver/month.',
        );
      keys.add(key);
    }
  }
  const changes: ScenarioChange[] = d.modifications
    .filter((m) => m.kind !== 'collection_delay')
    .map((m) => ({
      id: m.id,
      label: d.title,
      decision: m.kind === 'revenue_decrease' ? 'sales' : 'spending',
      scope: { kind: 'company' },
      currency: s.document.currency,
      source: { kind: 'assumption', note: m.note, reference: 'Pinned source stress ' + id },
      dependencies: [],
      primitive: {
        kind: 'adjust',
        targetEntryId: m.targetEntryId,
        start: m.start,
        end: m.end,
        operation: m.kind === 'revenue_decrease' ? 'percentage_decrease' : 'percentage_increase',
        value: m.rate,
        cashReplacement: null,
      },
    }));
  const intermediate = runScenario({
    contractVersion: SCENARIO_CONTRACT,
    scenarioEngineVersion: SCENARIO_ENGINE,
    scenarioVersionId: id,
    confirmedBy: s.confirmedBy,
    confirmedAt: s.confirmedAt,
    createdBy: s.actorId,
    actorId: s.actorId,
    capturedAt: s.confirmedAt,
    suppliedBy: Object.fromEntries(changes.map((c) => [c.id, s.actorId])),
    document: {
      contractVersion: SCENARIO_CONTRACT,
      title: d.title,
      baselineVersionId: s.baselineVersionId,
      currency: s.document.currency,
      type: 'combined',
      changes,
      expansion: null,
      paybackRequested: false,
    },
    baseline: s,
  });
  let input = intermediate.modifiedInputs;
  const lineage: StressOutcome['lineage'] = intermediate.lineage.map((l) => ({
    entryId: l.entryId,
    sourceEntryId: l.baselineEntryId ?? l.entryId,
    definitionId: l.changeId ? id : null,
  }));
  for (const m of d.modifications.filter((m) => m.kind === 'collection_delay')) {
    const targets = input.entries.filter(
      (e) =>
        lineage.some((l) => l.entryId === e.id && l.sourceEntryId === m.targetEntryId) &&
        e.start <= m.end &&
        e.end >= m.start,
    );
    for (const e of targets) {
      if (e.cashTreatment.kind !== 'profile')
        throw new StressInvalid('Collection profile no longer available.');
      const profile = e.cashTreatment;
      input.entries = input.entries.filter((x) => x.id !== e.id);
      for (const period of monthsFrom(e.start, monthDistance(e.start, e.end) + 1)) {
        const affected = period >= m.start && period <= m.end;
        const entry = {
          ...structuredClone(e),
          id: derivedId(`${id}/timing/${e.id}/${period}`),
          start: period,
          end: period,
        };
        if (affected)
          entry.cashTreatment = {
            kind: 'profile',
            buckets: profile.buckets.map((b) => ({
              ...b,
              offsetMonths: b.offsetMonths + m.delayMonths!,
            })),
          };
        input.entries.push(entry);
        lineage.push({
          entryId: entry.id,
          sourceEntryId: m.targetEntryId,
          definitionId: affected
            ? id
            : (lineage.find((l) => l.entryId === e.id)?.definitionId ?? null),
        });
      }
    }
  }
  input = planningDocumentSchema.parse(input);
  return {
    snapshot: { ...s, planningVersionId: id, document: input },
    lineage: lineage.filter((l) => input.entries.some((e) => e.id === l.entryId)),
  };
}
export function runStress(
  source: Source,
  definition: Definition,
  definitionId: string,
  runId: string,
  policy: Policy,
  creator?: { id: string; at: string },
): StressOutcome {
  const prepared = stressInputs(source, definition, definitionId);
  if (creator) {
    prepared.snapshot.actorId = creator.id;
    prepared.snapshot.confirmedBy = creator.id;
    prepared.snapshot.confirmedAt = creator.at;
  }
  prepared.snapshot.suppliedBy = Object.fromEntries(
    prepared.lineage.map((l) => [
      l.entryId,
      l.definitionId
        ? prepared.snapshot.actorId
        : (source.snapshot.suppliedBy[l.sourceEntryId] ?? source.snapshot.actorId),
    ]),
  );
  const financial = calculateBaseline(prepared.snapshot);
  for (const m of financial.evidence) {
    const l = prepared.lineage.find((l) => l.entryId === m.entryId);
    if (l && !l.definitionId) {
      const original = source.financial.evidence.find((e) => e.entryId === l.sourceEntryId);
      if (original) {
        m.sourceVersionId = original.sourceVersionId;
        m.confirmedBy = original.confirmedBy;
        m.confirmedAt = original.confirmedAt;
      }
    }
  }
  return {
    version: STRESS_VERSION,
    definitionId,
    source: source.ref,
    input: prepared.snapshot,
    financial,
    risk: evaluateRisk(financial, policy, { kind: 'stress', id: runId }),
    changes: definition.modifications,
    lineage: prepared.lineage,
  };
}
export function assertCompatible(options: Option[], policy: Policy) {
  if (!options.length) throw new StressInvalid('Choose at least one completed result.');
  const first = options[0];
  for (const o of options) {
    const a = first.source.snapshot,
      b = o.source.snapshot;
    if (
      o.source.baselineVersionId !== first.source.baselineVersionId ||
      o.financial.currency !== first.financial.currency ||
      o.financial.currency !== policy.currency ||
      JSON.stringify(o.financial.periods.map((p) => p.period)) !==
        JSON.stringify(first.financial.periods.map((p) => p.period)) ||
      a.engineVersion !== b.engineVersion ||
      a.roundingPolicyVersion !== b.roundingPolicyVersion ||
      JSON.stringify(a.document.coverage) !== JSON.stringify(b.document.coverage) ||
      JSON.stringify(a.document.requestedOutputs) !== JSON.stringify(b.document.requestedOutputs) ||
      b.document.entries.some((e) => e.scope.kind !== 'company') ||
      o.risk.policyId !== policy.id
    )
      throw new StressInvalid(
        'Comparison requires the same baseline, currency, periods, financial basis, company scope, calculation policy and risk policy.',
      );
  }
}
export function makeBrief(comparison: Comparison, id: string): Brief {
  assertCompatible(comparison.options, comparison.policy);
  return {
    version: 'brief-1.0.0',
    title: comparison.title,
    comparisonId: id,
    policy: comparison.policy,
    baselineVersionId: comparison.baselineVersionId,
    options: comparison.options.map((o) => ({
      label: o.label,
      ref: o.ref,
      source: o.source.ref,
      metrics: [
        {
          label: 'Ending cash',
          value: o.financial.periods.at(-1)?.closingCash ?? null,
          path: `periods[${o.financial.periods.length - 1}].closingCash`,
        },
        {
          label: 'Minimum projected cash',
          value: o.financial.minimumCash?.amount ?? null,
          path: 'minimumCash.amount',
        },
        {
          label: 'First-month cash outflows (not total investment)',
          value: o.financial.periods[0]?.cashOutflows ?? null,
          path: 'periods[0].cashOutflows',
        },
      ],
      periods: o.financial.periods,
      risk: o.risk,
      stress: o.definition,
      assumptions: o.source.snapshot.document.entries
        .filter((e) => e.source !== 'observed')
        .map((e) => ({
          component: e.componentKey,
          source: e.source,
          note: e.note,
          forecastRef: e.forecastRef ?? null,
        })),
      limitations: o.financial.limitations,
    })),
    failures: comparison.failures,
    limitations: comparison.limitations,
    unsupported: [
      'No automatic recommendation, safety ranking or risk score.',
      'Runway and unit break-even are not supported; stress payback and total required investment are not inferred.',
      'A threshold result is not a guarantee of liquidity or business viability.',
    ],
  };
}
