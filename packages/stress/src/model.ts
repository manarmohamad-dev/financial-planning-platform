import { z } from 'zod';
import { idSchema, periodSchema, currencySchema, rateSchema } from '../../contracts/src/index.js';
import {
  nonnegativeMoney,
  type BaselineSnapshot,
  type BaselineResult,
} from '../../planning/src/model.js';
export const STRESS_VERSION = 'stress-1.0.0';
export const sourceSchema = z
  .object({ kind: z.enum(['baseline', 'scenario']), runId: idSchema })
  .strict();
export type SourceRef = z.infer<typeof sourceSchema>;
export type Source = {
  ref: SourceRef;
  title: string;
  baselineVersionId: string;
  snapshot: BaselineSnapshot;
  baselineSnapshot?: BaselineSnapshot;
  financial: BaselineResult;
  baseFinancial: BaselineResult;
  context: unknown;
  payback: unknown;
};
export const modificationSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['revenue_decrease', 'expense_increase', 'collection_delay']),
    targetEntryId: idSchema,
    start: periodSchema,
    end: periodSchema,
    rate: rateSchema.nullable(),
    delayMonths: z.number().int().min(0).max(12).nullable(),
    reference: z.literal('pinned_source'),
    dependencies: z.array(idSchema).max(24),
    note: z.string().trim().min(1).max(300),
  })
  .strict();
export const definitionSchema = z
  .object({
    version: z.literal(STRESS_VERSION),
    title: z.string().trim().min(1).max(120),
    source: sourceSchema,
    template: z.enum(['revenue', 'expenses', 'delay', 'combined', 'custom', 'zero']),
    modifications: z.array(modificationSchema).max(24),
    reviewed: z.literal(true),
  })
  .strict();
export type Definition = z.infer<typeof definitionSchema>;
export const policyInputSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    currency: currencySchema,
    minimumCash: nonnegativeMoney.nullable(),
    minimumOperatingResult: nonnegativeMoney.nullable(),
    negativeCash: z.boolean(),
    source: z.string().trim().min(1).max(500),
    expectedRevision: z.number().int().min(0),
    reviewed: z.literal(true),
  })
  .strict();
export type PolicyInput = z.infer<typeof policyInputSchema>;
export type Rule = {
  id: string;
  version: '1';
  metric: 'closingCash' | 'operatingResult';
  comparison: 'lt';
  threshold: string;
  source: string;
  scope: 'company';
  severity: 'critical' | 'warning' | 'attention';
};
export type Policy = {
  id: string;
  revision: number;
  title: string;
  currency: string;
  rules: Rule[];
  createdAt: string;
  createdBy: string;
};
export type RunRef = {
  kind: 'baseline' | 'scenario' | 'stress';
  id: string;
  section?: 'baseline' | 'scenario';
};
export type Finding = {
  id: string;
  ruleId: string;
  ruleVersion: string;
  policyId: string;
  severity: Rule['severity'];
  metric: Rule['metric'];
  threshold: string;
  comparison: 'lt';
  firstPeriod: string;
  lastPeriod: string;
  durationMonths: number;
  recoveryPeriod: string | null;
  recovery: 'within_horizon' | 'not_observed' | 'unknown';
  run: RunRef;
  template: 'threshold_breach_v1';
  explanation: string;
  evidence: { period: string; value: string; path: string }[];
};
export type Risk = {
  policyId: string;
  findings: Finding[];
  checks: {
    ruleId: string;
    status: 'met' | 'breached' | 'unavailable';
    firstBreach: string | null;
    breachPeriods: number;
    values: { period: string; value: string | null; path: string }[];
  }[];
  unsupported: string[];
};
export type StressOutcome = {
  version: typeof STRESS_VERSION;
  definitionId: string;
  source: SourceRef;
  input: BaselineSnapshot;
  financial: BaselineResult;
  risk: Risk;
  changes: Definition['modifications'];
  lineage: { entryId: string; sourceEntryId: string; definitionId: string | null }[];
};
export type Option = {
  label: string;
  ref: RunRef;
  source: Source;
  financial: BaselineResult;
  risk: Risk;
  definition: Definition | null;
};
export type Comparison = {
  version: typeof STRESS_VERSION;
  title: string;
  policy: Policy;
  baselineVersionId: string;
  options: Option[];
  failures: { childId: string; definitionId: string; status: string; error: string | null }[];
  limitations: string[];
};
export type Brief = {
  version: 'brief-1.0.0';
  title: string;
  comparisonId: string;
  policy: Policy;
  baselineVersionId: string;
  options: {
    label: string;
    ref: RunRef;
    metrics: { label: string; value: string | null; path: string }[];
    periods: BaselineResult['periods'];
    risk: Risk;
    stress: Definition | null;
    source: SourceRef;
    assumptions: { component: string; source: string; note: string; forecastRef: unknown }[];
    limitations: string[];
  }[];
  failures: Comparison['failures'];
  limitations: string[];
  unsupported: string[];
};
