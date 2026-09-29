import { z } from 'zod';
import {
  currencySchema,
  dateSchema,
  idSchema,
  periodSchema,
  rateSchema,
  scopeSchema,
} from '../../contracts/src/index.js';
import {
  nonnegativeMoney,
  planningEntrySchema,
  type BaselineResult,
  type BaselineSnapshot,
  type CapabilityReport,
  type PlanningDocument,
} from '../../planning/src/model.js';

export const SCENARIO_CONTRACT = 'scenario-1.0.0';
export const SCENARIO_ENGINE = 'scenario-transform-1.0.0';
export const decisionTypes = ['sales', 'hiring', 'spending', 'expansion', 'combined'] as const;
export const scenarioChangeSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1).max(100),
    decision: z.enum(['sales', 'hiring', 'spending', 'expansion']),
    scope: scopeSchema,
    currency: currencySchema,
    source: z
      .object({
        kind: z.enum(['observed', 'schedule', 'assumption', 'forecast']),
        note: z.string().trim().min(1).max(500),
        reference: z.string().trim().min(1).max(100),
      })
      .strict(),
    dependencies: z.array(idSchema).max(30),
    primitive: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('adjust'),
          targetEntryId: idSchema,
          start: periodSchema,
          end: periodSchema,
          operation: z.enum([
            'set',
            'add',
            'subtract',
            'percentage_increase',
            'percentage_decrease',
            'remove',
          ]),
          value: z.union([nonnegativeMoney, rateSchema]).nullable(),
          cashReplacement: z
            .array(
              z
                .object({
                  period: periodSchema,
                  activityPeriod: periodSchema,
                  amount: nonnegativeMoney,
                  date: dateSchema.nullable(),
                })
                .strict(),
            )
            .max(36)
            .nullable(),
        })
        .strict(),
      z.object({ kind: z.literal('entry'), entry: planningEntrySchema }).strict(),
    ]),
  })
  .strict();
export const scenarioDocumentSchema = z
  .object({
    contractVersion: z.literal(SCENARIO_CONTRACT),
    title: z.string().trim().min(1).max(120),
    baselineVersionId: idSchema,
    currency: currencySchema,
    type: z.enum(decisionTypes),
    changes: z.array(scenarioChangeSchema).max(30),
    expansion: z
      .object({
        revenueMode: z.enum(['modeled', 'excluded_unknown']).nullable(),
        costsReviewed: z.boolean(),
        note: z.string().max(500),
      })
      .strict()
      .nullable(),
    paybackRequested: z.boolean(),
  })
  .strict();
export type ScenarioDocument = z.infer<typeof scenarioDocumentSchema>;
export type ScenarioChange = z.infer<typeof scenarioChangeSchema>;
export type ScenarioFinding = {
  code: string;
  message: string;
  readiness: 'missing_required_input' | 'invalid_conflicting_input' | 'unsupported';
  changeId?: string;
  requirement: {
    necessity: 'required' | 'optional';
    permittedSources: ('observed' | 'schedule' | 'assumption')[];
  };
};
export type ScenarioReadiness = {
  readiness: 'ready' | ScenarioFinding['readiness'];
  executable: boolean;
  evidence: string[];
  findings: ScenarioFinding[];
  financial: CapabilityReport | null;
  limitations: string[];
};
export type InputLineage = {
  entryId: string;
  baselineEntryId: string | null;
  changeId: string | null;
  sourceVersionId: string;
  confirmedBy: string;
  confirmedAt: string;
  suppliedBy: string;
};
export type ScenarioSnapshot = {
  contractVersion: typeof SCENARIO_CONTRACT;
  scenarioEngineVersion: typeof SCENARIO_ENGINE;
  scenarioVersionId: string;
  confirmedBy: string;
  confirmedAt: string;
  createdBy: string;
  actorId: string;
  capturedAt: string;
  suppliedBy: Record<string, string>;
  document: ScenarioDocument;
  baseline: BaselineSnapshot;
};
export { comparisonMetrics } from './metrics.js';
import type { Metric } from './metrics.js';
export type { Metric } from './metrics.js';
export type Difference = {
  baseline: string | null;
  scenario: string | null;
  difference: string | null;
};
export type ScenarioResult = {
  manifest: Omit<ScenarioSnapshot, 'document' | 'baseline'> & {
    workspaceId: string;
    baselineVersionId: string;
    planningVersionId: string;
    financialEngineVersion: string;
    roundingPolicyVersion: string;
    reservePolicyVersionId: string | null;
    currency: string;
  };
  changes: ScenarioChange[];
  readiness: ScenarioReadiness;
  modifiedInputs: PlanningDocument;
  lineage: InputLineage[];
  baseline: BaselineResult;
  scenario: BaselineResult;
  comparison: {
    periods: { period: string; metrics: Record<Metric, Difference> }[];
    minimumCash: Difference;
    fundingGap: Difference;
    reserveBreach: { baseline: boolean | null; scenario: boolean | null };
    firstReserveBreach: { baseline: string | null; scenario: string | null };
    firstNegativePeriod: { baseline: string | null; scenario: string | null };
  };
  payback: {
    status: 'supported' | 'not_reached' | 'unsupported';
    period: string | null;
    reason: string;
  };
  breakEven: { status: 'unsupported'; amount: null; reason: string };
};
