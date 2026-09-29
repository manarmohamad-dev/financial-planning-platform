import { z } from 'zod';
import { Decimal } from 'decimal.js';

export const CONTRACT_VERSION = '1.0.0';
export const ROUNDING_POLICY = 'minor-unit-half-up-v1';
export const currencySchema = z.enum(['EGP', 'SAR', 'USD', 'AED']);
export type Currency = z.infer<typeof currencySchema>;
export const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(
    (v) => Number(v.slice(0, 4)) >= 1900 && Number(v.slice(0, 4)) <= 9999,
    'Unsupported year',
  );
export const dateSchema = z.iso.date();
export const moneySchema = z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,6})?$/);
export const rateSchema = z.string().regex(/^-?(0|[1-9]\d{0,5})(\.\d{1,12})?$/);
export const idSchema = z.uuid();
const D = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });

/** Decimal-only domain boundary. No Number conversion is allowed for money. */
export class Money {
  private constructor(
    private readonly value: Decimal,
    readonly currency: Currency,
  ) {
    if (!value.isFinite() || value.abs().gte('1000000000000000000'))
      throw new Error('MONEY_OVERFLOW');
  }
  static parse(value: string, currency: Currency): Money {
    return new Money(new D(moneySchema.parse(value)), currencySchema.parse(currency));
  }
  private compatible(other: Money) {
    if (other.currency !== this.currency) throw new Error('CURRENCY_MISMATCH');
  }
  add(other: Money): Money {
    this.compatible(other);
    return new Money(this.value.plus(other.value), this.currency);
  }
  subtract(other: Money): Money {
    this.compatible(other);
    return new Money(this.value.minus(other.value), this.currency);
  }
  compare(other: Money): number {
    this.compatible(other);
    return this.value.comparedTo(other.value);
  }
  multiply(rate: string): Money {
    return new Money(this.value.times(rateSchema.parse(rate)), this.currency);
  }
  quantize(): string {
    const value = this.value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (value.abs().gte('1000000000000000000')) throw new Error('MONEY_OVERFLOW');
    return value.toFixed(2);
  }
  serialize(): string {
    if (this.value.decimalPlaces() > 6) throw new Error('PRECISION_REQUIRES_QUANTIZATION');
    return this.value.toFixed(6);
  }
  allocate(weights: string[]): string[] {
    if (!weights.length) throw new Error('TIMING_INCOMPLETE');
    const parts = weights.map((w) => new D(rateSchema.parse(w)));
    if (parts.some((p) => p.lt(0) || p.gt(1)) || !parts.reduce((a, b) => a.plus(b), new D(0)).eq(1))
      throw new Error('TIMING_INCOMPLETE');
    const total = new D(this.quantize());
    let remaining = total.abs();
    const buckets = parts.map((p, index) => {
      const proposed =
        index === parts.length - 1
          ? remaining
          : D.min(total.abs().times(p).toDecimalPlaces(2), remaining);
      remaining = remaining.minus(proposed);
      return total.isNegative() ? proposed.negated() : proposed;
    });
    return buckets.map((p) => p.toFixed(2));
  }
}
export class Rate {
  readonly value: string;
  constructor(value: string) {
    this.value = rateSchema.parse(value);
  }
}
export function forecastToMoney(value: number, currency: Currency): Money {
  if (!Number.isFinite(value)) throw new Error('FORECAST_NONFINITE');
  return Money.parse(new D(String(value)).toFixed(6), currency);
}
export function requireRevision(current: number, expected: number): void {
  if (current !== expected) throw new Error('VERSION_CONFLICT');
}
export function assertMutable(state: 'draft' | 'confirmed'): void {
  if (state !== 'draft') throw new Error('IMMUTABLE_VERSION');
}

export const permissions = [
  'data.view',
  'data.edit',
  'data.import',
  'mapping.review',
  'dataset.confirm',
  'baseline.edit',
  'baseline.publish',
  'scenario.edit',
  'scenario.run',
  'stress.run',
  'comparison.view',
  'ai.use',
  'brief.prepare',
  'risk.edit',
  'members.manage',
  'workspace.edit',
  'workspace.archive',
  'workspace.delete',
  'ownership.transfer',
] as const;
export const permissionSchema = z.enum(permissions);
export type Permission = z.infer<typeof permissionSchema>;
export const roleSchema = z.enum(['OWNER', 'MANAGER', 'ANALYST']);
export type Role = z.infer<typeof roleSchema>;
const planning: Permission[] = [
  'data.view',
  'baseline.edit',
  'scenario.edit',
  'scenario.run',
  'stress.run',
  'comparison.view',
  'ai.use',
  'brief.prepare',
];
export const rolePermissions: Record<Role, readonly Permission[]> = {
  OWNER: permissions,
  MANAGER: [...planning, 'baseline.publish'],
  ANALYST: [...planning, 'data.edit', 'data.import', 'mapping.review', 'dataset.confirm'],
};
export const demoPermissions: readonly Permission[] = [
  'data.view',
  'scenario.edit',
  'scenario.run',
  'stress.run',
  'comparison.view',
  'ai.use',
  'brief.prepare',
];
export const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('company') }).strict(),
  z.object({ kind: z.enum(['branch', 'department']), id: idSchema }).strict(),
]);
export const sourceSchema = z
  .object({
    kind: z.enum(['observed', 'schedule', 'forecast', 'assumption']),
    versionId: idSchema,
    locator: z.string().max(200).optional(),
    confirmed: z.literal(true),
  })
  .strict();
export const observationSchema = z
  .object({
    metric: z.string().min(1).max(60),
    componentId: idSchema,
    period: periodSchema,
    amount: moneySchema,
    currency: currencySchema,
    scope: scopeSchema,
    basis: z.enum(['recognized', 'cash_receipt', 'cash_payment']),
    classification: z.enum(['actual', 'budget']),
    source: sourceSchema,
  })
  .strict();
export const assumptionSchema = z
  .object({
    key: z.string().min(1).max(80),
    value: moneySchema,
    currency: currencySchema,
    explanation: z.string().min(1).max(500),
  })
  .strict();
export const draftPayloadSchema = z
  .object({ title: z.string().min(1).max(120), assumptions: z.array(assumptionSchema).max(50) })
  .strict();
export const requirementSchema = z
  .object({
    key: z.string(),
    necessity: z.enum(['required', 'optional']),
    permittedSources: z.array(sourceSchema.shape.kind).min(1),
    reason: z.string(),
    capability: z.string(),
  })
  .strict();
export const capabilitySchema = z
  .object({
    capability: z.string(),
    readiness: z.enum([
      'ready',
      'missing_required_input',
      'invalid_conflicting_input',
      'unsupported',
    ]),
    evidence: z.array(
      z.enum(['observed', 'scheduled', 'forecast_supported', 'assumption_led', 'limited']),
    ),
    findings: z.array(
      z
        .object({
          code: z.string(),
          requirement: requirementSchema.optional(),
          message: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const changeSchema = z
  .object({
    id: idSchema,
    target: z.string().min(1),
    scope: scopeSchema,
    operation: z.enum(['set', 'add', 'multiply', 'schedule']),
    unit: z.enum(['money', 'ratio', 'headcount']),
    value: z.string(),
    start: periodSchema,
    end: periodSchema,
    reference: z.enum(['baseline', 'previous_change', 'explicit_schedule']),
    referenceId: idSchema.optional(),
    dependencies: z.array(idSchema),
    source: sourceSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.end < v.start) ctx.addIssue({ code: 'custom', message: 'End precedes start' });
    if (v.reference !== 'baseline' && !v.referenceId)
      ctx.addIssue({ code: 'custom', message: 'Explicit reference required' });
    const valueSchema =
      v.unit === 'money'
        ? moneySchema
        : v.unit === 'ratio'
          ? rateSchema
          : z.string().regex(/^-?\d+$/);
    if (!valueSchema.safeParse(v.value).success)
      ctx.addIssue({ code: 'custom', message: 'Invalid value for unit' });
    if (v.operation === 'multiply' && v.unit !== 'ratio')
      ctx.addIssue({ code: 'custom', message: 'Multiply requires ratio' });
  });
export const scenarioSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    workspaceId: idSchema,
    baselineVersionId: idSchema,
    changes: z.array(changeSchema).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    const ids = new Set(v.changes.map((c) => c.id));
    if (ids.size !== v.changes.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate changes' });
    const done = new Set<string>();
    for (const c of v.changes) {
      if (
        c.dependencies.some((id) => !done.has(id)) ||
        (c.reference === 'previous_change' && !done.has(c.referenceId!))
      )
        ctx.addIssue({ code: 'custom', message: 'Dependencies must precede change' });
      done.add(c.id);
    }
  });
export const scheduleSchema = z
  .object({
    id: idSchema,
    componentId: idSchema,
    date: dateSchema,
    amount: moneySchema,
    currency: currencySchema,
    effect: z.enum(['recognized_revenue', 'recognized_expense', 'cash_receipt', 'cash_payment']),
    openingObligation: z.boolean(),
    source: sourceSchema,
  })
  .strict();
export const timingSchema = z
  .object({
    componentId: idSchema,
    basis: z.enum(['revenue', 'expense', 'purchases']),
    buckets: z
      .array(
        z
          .object({ offsetMonths: z.number().int().min(0).max(120), proportion: rateSchema })
          .strict(),
      )
      .min(1),
    source: sourceSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    const weights = v.buckets.map((b) => new D(b.proportion));
    if (
      weights.some((w) => w.lt(0) || w.gt(1)) ||
      !weights.reduce((a, b) => a.plus(b), new D(0)).eq(1)
    )
      ctx.addIssue({ code: 'custom', message: 'TIMING_INCOMPLETE' });
  });
export const componentSchema = z
  .object({
    id: idSchema,
    category: z.string().min(1).max(60),
    scope: scopeSchema,
    behavior: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('scheduled'), scheduleIds: z.array(idSchema) }).strict(),
      z
        .object({
          kind: z.literal('revenue_linked'),
          referenceComponentId: idSchema,
          rate: rateSchema,
          source: sourceSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal('headcount_driven'),
          headcount: z.number().int().nonnegative(),
          monthlyLoadedCost: moneySchema,
          start: periodSchema,
          source: sourceSchema,
        })
        .strict(),
    ]),
    commitment: z.enum(['committed', 'discretionary', 'mixed']),
    currency: currencySchema,
  })
  .strict();
export const sourceAssignmentSchema = z
  .object({
    componentId: idSchema,
    period: periodSchema,
    scope: scopeSchema,
    basis: z.enum(['recognized', 'cash_receipt', 'cash_payment']),
    amount: moneySchema,
    currency: currencySchema,
    source: sourceSchema,
  })
  .strict();
export const resolvedSourcesSchema = z.array(sourceAssignmentSchema).superRefine((values, ctx) => {
  const seen = new Set<string>();
  for (const v of values) {
    const key = `${v.componentId}/${v.period}/${JSON.stringify(v.scope)}/${v.basis}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', message: 'SOURCE_CONFLICT' });
    seen.add(key);
  }
});
export const versionReferenceSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    kind: z.enum([
      'dataset',
      'mapping',
      'schedule',
      'assumptions',
      'baseline',
      'scenario',
      'forecast',
      'risk_policy',
      'brief',
    ]),
    contractVersion: z.literal(CONTRACT_VERSION),
    confirmedAt: z.iso.datetime(),
    confirmedBy: idSchema,
  })
  .strict();
export const runManifestSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    workspaceId: idSchema,
    datasetVersionId: idSchema,
    mappingVersionId: idSchema.nullable(),
    scheduleVersionIds: z.array(idSchema),
    assumptionVersionIds: z.array(idSchema),
    forecastArtifactIds: z.array(idSchema),
    baselineVersionId: idSchema,
    scenarioVersionId: idSchema.nullable(),
    financialEngineVersion: z.string().min(1),
    riskPolicyVersionId: idSchema,
    roundingPolicyVersion: z.literal(ROUNDING_POLICY),
    currency: currencySchema,
    scope: scopeSchema,
    projectionStart: periodSchema,
    forecastOrigin: periodSchema.nullable(),
    horizonMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    actorId: idSchema,
    capturedAt: z.iso.datetime(),
  })
  .strict();
export const engineInputSchema = z
  .object({
    manifest: runManifestSchema,
    openingCash: moneySchema,
    openingCashDate: dateSchema,
    reserve: moneySchema.optional(),
    observations: z.array(observationSchema),
    components: z.array(componentSchema),
    resolvedSources: resolvedSourcesSchema,
    schedules: z.array(scheduleSchema),
    timingProfiles: z.array(timingSchema),
    assumptions: z.array(assumptionSchema),
    changes: z.array(changeSchema),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const x of [
      ...v.observations,
      ...v.schedules,
      ...v.assumptions,
      ...v.components,
      ...v.resolvedSources,
    ])
      if (x.currency !== v.manifest.currency)
        ctx.addIssue({ code: 'custom', message: 'CURRENCY_MISMATCH' });
    if (v.openingCashDate !== `${v.manifest.projectionStart}-01`)
      ctx.addIssue({
        code: 'custom',
        message: 'Opening cash must precede activity on projection start date',
      });
  });
const metricValue = z.object({ period: periodSchema, amount: moneySchema }).strict();
export const engineOutputSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    runId: idSchema,
    series: z.array(
      z
        .object({
          metric: z.enum([
            'revenue',
            'modeled_expenses',
            'operating_result',
            'cash_inflows',
            'cash_outflows',
            'closing_cash',
            'incremental_operating_result',
            'incremental_cash',
            'upfront_commitments',
            'recurring_commitments',
          ]),
          values: z.array(metricValue),
        })
        .strict(),
    ),
    minimumCash: metricValue,
    firstNegativePeriod: periodSchema.nullable(),
    firstReserveBreach: periodSchema.nullable(),
    fundingGap: moneySchema.nullable(),
    payback: z
      .object({
        status: z.enum(['supported', 'not_reached', 'unsupported']),
        period: periodSchema.nullable(),
        reason: z.string().optional(),
      })
      .strict(),
    breakEven: z
      .object({
        status: z.enum(['supported', 'unsupported']),
        amount: moneySchema.nullable(),
        reason: z.string().optional(),
      })
      .strict(),
    tailMovements: z.array(scheduleSchema),
    findings: z.array(
      z.object({ code: z.string(), message: z.string(), sourceIds: z.array(idSchema) }).strict(),
    ),
  })
  .strict();
export const forecastRequestSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    requestId: idSchema,
    frequency: z.literal('monthly'),
    series: z.array(z.object({ period: periodSchema, value: z.number().finite() }).strict()),
    horizonMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    candidates: z
      .array(z.enum(['naive', 'ses', 'holt_damped', 'seasonal_naive', 'seasonal_ets']))
      .min(1),
    folds: z.array(z.object({ trainEnd: periodSchema, testEnd: periodSchema }).strict()),
    seed: z.number().int().optional(),
  })
  .strict();
export const forecastResponseSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    requestId: idSchema,
    status: z.enum(['supported', 'limited', 'ineligible', 'failed']),
    selectedModel: z.string().nullable(),
    points: z.array(
      z
        .object({
          period: periodSchema,
          value: z.number().finite(),
          lower: z.number().finite().optional(),
          upper: z.number().finite().optional(),
          intervalLevel: z.number().gt(0).lt(1).optional(),
        })
        .strict(),
    ),
    evaluations: z.array(
      z
        .object({
          model: z.string(),
          horizon: z.number().int().positive(),
          origins: z.number().int().nonnegative(),
          mae: z.number().finite().nonnegative().nullable(),
          rmse: z.number().finite().nonnegative().nullable(),
          bias: z.number().finite().nullable(),
          reason: z.string().optional(),
        })
        .strict(),
    ),
    runtimeVersion: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();
export const jobSchema = z
  .object({
    contractVersion: z.literal(CONTRACT_VERSION),
    id: idSchema,
    workspaceId: idSchema,
    actorId: idSchema,
    operation: z.enum(['import', 'forecast', 'analysis', 'brief']),
    inputVersionIds: z.array(idSchema),
    idempotencyKey: z.string().min(1).max(100),
    runId: idSchema.nullable(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    attempt: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    failureCode: z.string().optional(),
  })
  .strict();
export const jobTransitions: Record<z.infer<typeof jobSchema>['status'], readonly string[]> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  failed: ['queued'],
  succeeded: [],
  cancelled: [],
};
export const jobAttemptSchema = z
  .object({
    id: idSchema,
    jobId: idSchema,
    workspaceId: idSchema,
    number: z.number().int().positive(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    failureCode: z.string().nullable(),
  })
  .strict();
