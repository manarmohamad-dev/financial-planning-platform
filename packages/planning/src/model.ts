import { z } from 'zod';
import {
  currencySchema,
  dateSchema,
  idSchema,
  moneySchema,
  periodSchema,
  rateSchema,
  scopeSchema,
} from '../../contracts/src/index.js';

export const PLANNING_CONTRACT = 'baseline-1.0.0';
export const ENGINE_VERSION = 'baseline-engine-1.0.0';
export const categories = [
  'revenue',
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
  'known_receipt',
  'known_payment',
  'purchases',
  'capex',
  'debt_principal',
  'debt_interest',
  'financing',
  'owner_contribution',
  'owner_withdrawal',
  'tax',
  'refunds',
  'net_settlement',
  'restricted_release',
] as const;
export const effects = [
  'revenue',
  'revenue_reduction',
  'operating_expense',
  'non_operating_expense',
  'cash_receipt',
  'cash_payment',
  'restricted_release',
] as const;
export const sources = ['observed', 'schedule', 'assumption', 'forecast'] as const;
export const nonnegativeMoney = moneySchema.refine(
  (v) => !v.startsWith('-'),
  'Use a nonnegative amount; the financial effect defines direction',
);
export const timingBucketSchema = z
  .object({ offsetMonths: z.number().int().min(0).max(120), proportion: rateSchema })
  .strict();
export const treatmentSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('profile'), buckets: z.array(timingBucketSchema).min(1).max(24) })
    .strict(),
  z.object({ kind: z.literal('explicit') }).strict(),
  z.object({ kind: z.literal('non_cash') }).strict(),
  z.object({ kind: z.literal('not_modeled') }).strict(),
  z.object({ kind: z.literal('included_in_net') }).strict(),
]);
export const driverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), amount: nonnegativeMoney.nullable() }).strict(),
  z
    .object({
      kind: z.literal('revenue_linked'),
      baseComponent: z.string().min(1).max(60),
      rate: rateSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('headcount'),
      count: z.number().int().min(0).max(100000).nullable(),
      monthlyCost: nonnegativeMoney.nullable(),
      onboardingCost: nonnegativeMoney.nullable(),
    })
    .strict(),
]);
export const planningEntrySchema = z
  .object({
    id: idSchema,
    componentKey: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),
    label: z.string().trim().min(1).max(100),
    category: z.enum(categories),
    effect: z.enum(effects),
    currency: currencySchema,
    scope: scopeSchema,
    source: z.enum(sources),
    note: z.string().trim().min(1).max(500),
    start: periodSchema,
    end: periodSchema,
    date: dateSchema.nullable(),
    driver: driverSchema,
    cashTreatment: treatmentSchema,
    committed: z.boolean(),
    openingObligation: z.boolean(),
    settles: z.object({ entryId: idSchema, activityPeriod: periodSchema }).strict().nullable(),
    forecastRef: z
      .object({ artifactId: idSchema, approvalId: idSchema, period: periodSchema })
      .strict()
      .optional(),
  })
  .strict();
export type PlanningEntry = z.infer<typeof planningEntrySchema>;
export const planningDocumentSchema = z
  .object({
    contractVersion: z.literal(PLANNING_CONTRACT),
    title: z.string().trim().min(1).max(120),
    currency: currencySchema,
    projectionStart: periodSchema,
    horizonMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    requestedOutputs: z
      .array(z.enum(['operating', 'cash']))
      .min(1)
      .max(2),
    openingCash: z
      .object({
        available: nonnegativeMoney.nullable(),
        restricted: nonnegativeMoney.nullable(),
        asOf: dateSchema,
        source: z.enum(['observed', 'assumption']),
        note: z.string().trim().min(1).max(500),
      })
      .strict()
      .nullable(),
    coverage: z
      .object({
        revenueComplete: z.boolean(),
        expensesComplete: z.boolean(),
        cashComplete: z.boolean(),
        depreciation: z.enum(['included', 'excluded', 'not_applicable']),
        revenueConvention: z.enum(['gross_with_refunds', 'net_of_refunds']),
        settlementConvention: z.enum(['gross', 'net']),
      })
      .strict(),
    entries: z.array(planningEntrySchema).max(150),
  })
  .strict();
export type PlanningDocument = z.infer<typeof planningDocumentSchema>;
export type CapabilityName = 'operating' | 'cash';
export type Finding = {
  code: string;
  message: string;
  capability: CapabilityName;
  readiness: 'missing_required_input' | 'invalid_conflicting_input' | 'unsupported';
  entryId?: string;
  requirement: {
    necessity: 'required';
    permittedSources: ('observed' | 'schedule' | 'assumption')[];
    target: string;
  };
};
export type CapabilityReport = {
  capabilities: {
    capability: CapabilityName;
    readiness: 'ready' | Finding['readiness'];
    evidence: string[];
    findings: Finding[];
  }[];
  executable: boolean;
  requestedOutputs: CapabilityName[];
  limitations: string[];
};
export type ReservePolicy = { id: string; minimum: string | null; note: string };
export type BaselineSnapshot = {
  contractVersion: typeof PLANNING_CONTRACT;
  workspaceId: string;
  planningVersionId: string;
  baselineVersionId: string;
  actorId: string;
  confirmedBy: string;
  suppliedBy: Record<string, string>;
  confirmedAt: string;
  document: PlanningDocument;
  reservePolicy: ReservePolicy | null;
  engineVersion: typeof ENGINE_VERSION;
  roundingPolicyVersion: string;
};
export type Movement = {
  id: string;
  entryId: string;
  componentKey: string;
  label: string;
  category: PlanningEntry['category'];
  effect: PlanningEntry['effect'];
  period: string;
  activityPeriod: string;
  date: string | null;
  amount: string;
  source: PlanningEntry['source'];
  sourceVersionId: string;
  confirmedBy: string;
  confirmedAt: string;
  note: string;
  behavior: string;
  transformation: string;
  parentEntryIds: string[];
  committed: boolean;
  openingObligation: boolean;
};
export type PeriodResult = {
  period: string;
  revenue: string | null;
  operatingExpenses: string | null;
  operatingResult: string | null;
  nonOperatingExpenses: string | null;
  openingCash: string | null;
  cashInflows: string | null;
  cashOutflows: string | null;
  netCashMovement: string | null;
  closingCash: string | null;
  restrictedCash: string | null;
  evidence: {
    revenue: string[];
    operatingExpenses: string[];
    cashInflows: string[];
    cashOutflows: string[];
    openingCashFrom: string;
  };
};
export type BaselineResult = {
  contractVersion: typeof PLANNING_CONTRACT;
  engineVersion: typeof ENGINE_VERSION;
  currency: PlanningDocument['currency'];
  capabilities: CapabilityReport;
  periods: PeriodResult[];
  minimumCash: { period: string; amount: string } | null;
  firstNegativePeriod: string | null;
  firstReserveBreach: string | null;
  fundingGap: string | null;
  reservePolicy: ReservePolicy | null;
  commitments: {
    recognizedTotal: string;
    cashPaymentsTotal: string;
    cashReceiptsTotal: string;
    movementIds: string[];
  };
  tailMovements: Movement[];
  evidence: Movement[];
  openingCashEvidence: PlanningDocument['openingCash'];
  manifest: Omit<BaselineSnapshot, 'document'>;
  limitations: string[];
};
export function monthsFrom(start: string, count: number): string[] {
  const [y, m] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const n = y * 12 + m - 1 + i;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
  });
}
export function monthDistance(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + bm - am;
}
export function isCash(effect: PlanningEntry['effect']): boolean {
  return ['cash_receipt', 'cash_payment', 'restricted_release'].includes(effect);
}
