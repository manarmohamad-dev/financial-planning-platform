import { Decimal } from 'decimal.js';
import {
  monthsFrom,
  monthDistance,
  planningDocumentSchema,
  type PlanningDocument,
} from '../../planning/src/model.js';
import { derivedId } from '../../scenarios/src/engine.js';
import { Money } from '../../contracts/src/index.js';
import {
  type History,
  type Eligibility,
  type RuntimeResult,
  type Composition,
  type Composed,
} from './model.js';
export function eligibility(h: History): Eligibility {
  const n = h.observations.length,
    H = h.horizon,
    required = 12 + 3 * H;
  const result = (status: Eligibility['status'], reason: string): Eligibility => ({
    status,
    reason,
    observations: n,
    requiredObservations: required,
    seasonalSupported: false,
    folds: [],
  });
  if (![3, 6, 12].includes(H))
    return result(
      'unsupported_horizon',
      'Only 3, 6 and 12 month horizons are supported. Use explicit assumptions for other horizons.',
    );
  if (
    h.nature === 'known_schedule' ||
    h.observations.some((p) => p.source === 'schedule' || p.committed)
  )
    return result(
      'scheduled_not_forecast',
      'Known schedules and commitments must use their explicit future values, not a statistical forecast.',
    );
  if (h.structuralChange)
    return result(
      'structural_change_requires_assumption',
      'A declared structural change makes historical evaluation unreliable. Supply a reviewed assumption instead.',
    );
  const sorted = [...h.observations].sort((a, b) => a.period.localeCompare(b.period));
  if (
    n > 120 ||
    sorted.some(
      (p, i) =>
        !new Decimal(p.value).isFinite() ||
        new Decimal(p.value).isNegative() ||
        new Decimal(p.value).gt('1000000000000') ||
        p.source !== 'observed' ||
        p.partial ||
        p.period >= h.origin ||
        (i > 0 && monthDistance(sorted[i - 1].period, p.period) !== 1),
    ) ||
    (n && monthDistance(sorted[n - 1].period, h.origin) !== 1)
  )
    return result(
      'invalid_series',
      'Use at most 120 continuous, distinct, complete monthly Actual values immediately before the origin; no gaps, partial months, assumptions, negatives or values above 1 trillion.',
    );
  if (
    !['revenue', 'marketing', 'fees', 'cost_of_sales', 'other_operating'].includes(h.category) ||
    !['revenue', 'operating_expense'].includes(h.effect)
  )
    return result(
      'scheduled_not_forecast',
      'This series is outside the supported variable revenue/cost categories. Use schedules or explicit assumptions.',
    );
  if (n < 12)
    return result(
      'insufficient_history',
      'At least 12 usable monthly observations are needed before temporal evaluation is considered.',
    );
  if (n < required)
    return result(
      'insufficient_evaluation_evidence',
      `${H}-month evaluation requires at least ${required} observations: 12 training months plus three non-overlapping ${H}-month validation windows.`,
    );
  const values = sorted.map((p) => new Decimal(p.value)),
    prior = values.slice(0, -3),
    mean = prior.reduce((a, b) => a.add(b), new Decimal(0)).div(prior.length),
    recent = values
      .slice(-3)
      .reduce((a, b) => a.add(b), new Decimal(0))
      .div(3),
    sd = prior
      .reduce((a, b) => a.add(b.sub(mean).pow(2)), new Decimal(0))
      .div(prior.length)
      .sqrt();
  if (
    recent
      .sub(mean)
      .abs()
      .gt(Decimal.max(sd.mul(4), mean.abs().mul('0.75'), 1))
  )
    return result(
      'structural_change_requires_assumption',
      'The latest three months show a large level shift relative to earlier variation. Review the structural change and use assumptions.',
    );
  const folds = [0, 1, 2].map((i) => {
    const trainCount = n - (3 - i) * H;
    return {
      trainStart: sorted[0].period,
      trainEnd: sorted[trainCount - 1].period,
      validationStart: sorted[trainCount].period,
      validationEnd: sorted[trainCount + H - 1].period,
      trainCount,
      horizon: H,
    };
  });
  return {
    ...result(
      'eligible',
      'Three horizon-matched future validation windows are available; eligibility does not guarantee a defensible model will be selected.',
    ),
    folds,
    seasonalSupported: folds[0].trainCount >= 24,
  };
}
export function compose(
  template: PlanningDocument,
  input: Composition,
  artifact: { id: string; history: History; result: RuntimeResult } | null,
): Composed {
  if (template.projectionStart !== input.origin || template.horizonMonths !== input.horizon)
    throw new Error(
      'The confirmed future planning template must match the chosen origin and horizon.',
    );
  const document = structuredClone(template);
  document.title = input.title;
  const removed = new Set(input.replaceEntryIds);
  if (
    removed.size !== input.replaceEntryIds.length ||
    [...removed].some((id) => !template.entries.some((e) => e.id === id))
  )
    throw new Error('Replacement IDs must identify distinct entries in this confirmed template.');
  const overlap = template.entries.filter(
    (e) =>
      e.componentKey === input.componentKey &&
      e.effect === input.effect &&
      e.start <= monthsFrom(input.origin, input.horizon).at(-1)! &&
      e.end >= input.origin,
  );
  if (input.mode === 'forecast' && overlap.some((e) => e.source === 'schedule' || e.committed))
    throw new Error(
      'Known future schedules and commitments cannot be replaced by statistical forecasts.',
    );
  if (
    overlap.some((e) => !removed.has(e.id)) ||
    template.entries.some((e) => removed.has(e.id) && !overlap.includes(e))
  )
    throw new Error(
      'Explicitly select exactly the overlapping component/effect entries to replace; unrelated entries cannot be removed.',
    );
  if (template.entries.some((e) => e.settles && removed.has(e.settles.entryId)))
    throw new Error(
      'Linked cash schedules require a revised future template before this component can be replaced.',
    );
  document.entries = document.entries.filter((e) => !removed.has(e.id));
  if (
    input.mode === 'forecast' &&
    (!artifact ||
      artifact.id !== input.artifactId ||
      !input.approvalId ||
      artifact.result.status !== 'supported' ||
      artifact.history.origin !== input.origin ||
      artifact.history.horizon !== input.horizon ||
      artifact.history.componentKey !== input.componentKey ||
      artifact.history.category !== input.category ||
      artifact.history.effect !== input.effect ||
      artifact.history.currency !== template.currency)
  )
    throw new Error(
      'Select an approved supported forecast matching the exact currency, component, effect, category, origin and horizon.',
    );
  if (
    input.mode === 'assumption' &&
    (input.artifactId || input.approvalId || input.assumptionValues.length !== input.horizon)
  )
    throw new Error(
      'Fallback needs one explicit assumption per future month and no forecast approval reference.',
    );
  const points =
    input.mode === 'forecast'
      ? artifact!.result.points
      : monthsFrom(input.origin, input.horizon).map((period, i) => ({
          period,
          value: input.assumptionValues[i],
        }));
  if (
    points.length !== input.horizon ||
    points.some((p, i) => p.period !== monthsFrom(input.origin, input.horizon)[i])
  )
    throw new Error('Every future month needs an explicit input.');
  for (const p of points)
    document.entries.push({
      id: derivedId(`hybrid/${input.idempotencyKey}/${input.componentKey}/${p.period}`),
      componentKey: input.componentKey,
      label: input.componentKey,
      category: input.category,
      effect: input.effect,
      currency: template.currency,
      scope: { kind: 'company' },
      source: input.mode === 'forecast' ? 'forecast' : 'assumption',
      note: input.note,
      start: p.period,
      end: p.period,
      date: null,
      driver: { kind: 'fixed', amount: Money.parse(p.value, template.currency).serialize() },
      cashTreatment: input.cashTreatment,
      committed: false,
      openingObligation: false,
      settles: null,
      ...(input.mode === 'forecast'
        ? {
            forecastRef: {
              artifactId: artifact!.id,
              approvalId: input.approvalId!,
              period: p.period,
            },
          }
        : {}),
    });
  const parsed = planningDocumentSchema.parse(document);
  return {
    document: parsed,
    assignments: parsed.entries.flatMap((e) =>
      monthsFrom(e.start, monthDistance(e.start, e.end) + 1).map((period) => ({
        entryId: e.id,
        componentKey: e.componentKey,
        period,
        effect: e.effect,
        source: e.source,
        planningVersionId: template.entries.some((t) => t.id === e.id)
          ? input.templateVersionId
          : null,
        artifactId: e.forecastRef?.artifactId ?? null,
        approvalId: e.forecastRef?.approvalId ?? null,
      })),
    ),
  };
}
