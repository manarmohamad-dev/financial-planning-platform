import { z } from 'zod';
import { idSchema, periodSchema, currencySchema, moneySchema } from '../../contracts/src/index.js';
import { planningEntrySchema, planningDocumentSchema } from '../../planning/src/model.js';
export const FORECAST_VERSION = 'forecast-1.0.0';
export const requestSchema = z
  .object({
    planningVersionIds: z.array(idSchema).min(1).max(12),
    componentKey: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),
    origin: periodSchema,
    horizon: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    nature: z.enum(['variable', 'known_schedule']),
    structuralChange: z.boolean(),
    historyReviewed: z.literal(true),
    idempotencyKey: z.string().min(1).max(100),
  })
  .strict();
export type ForecastRequest = z.infer<typeof requestSchema>;
export const pointSchema = z.object({ period: periodSchema, value: moneySchema }).strict();
export const historySchema = z
  .object({
    currency: currencySchema,
    componentKey: z.string(),
    category: planningEntrySchema.shape.category,
    effect: planningEntrySchema.shape.effect,
    observations: z
      .array(
        pointSchema.extend({
          planningVersionId: idSchema,
          entryId: idSchema,
          source: planningEntrySchema.shape.source,
          committed: z.boolean(),
          partial: z.boolean(),
        }),
      )
      .max(1500),
    sourceVersionIds: z.array(idSchema),
    origin: periodSchema,
    horizon: z.number().int(),
    nature: z.enum(['variable', 'known_schedule']),
    structuralChange: z.boolean(),
  })
  .strict();
export type History = z.infer<typeof historySchema>;
export type Eligibility = {
  status:
    | 'eligible'
    | 'insufficient_history'
    | 'insufficient_evaluation_evidence'
    | 'unsupported_horizon'
    | 'scheduled_not_forecast'
    | 'invalid_series'
    | 'structural_change_requires_assumption';
  reason: string;
  observations: number;
  requiredObservations: number;
  seasonalSupported: boolean;
  folds: Fold[];
};
export type Fold = {
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
  trainCount: number;
  horizon: number;
};
const metric = z.string().regex(/^\d+(?:\.\d+)?$/);
export const runtimeInputSchema = z
  .object({
    version: z.literal(FORECAST_VERSION),
    series: z.array(pointSchema).min(1).max(120),
    horizon: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    origin: periodSchema,
    folds: z
      .array(
        z
          .object({
            trainStart: periodSchema,
            trainEnd: periodSchema,
            validationStart: periodSchema,
            validationEnd: periodSchema,
            trainCount: z.number().int().min(12).max(120),
            horizon: z.number().int().min(3).max(12),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();
export type RuntimeInput = z.infer<typeof runtimeInputSchema>;
export const modelNames = ['naive', 'moving_average_3', 'holt', 'holt_winters_additive'] as const;
const metricsSchema = z.object({ mae: metric, rmse: metric }).strict();
const evaluationSchema = z
  .object({
    fold: z.number().int(),
    predictions: z.array(pointSchema).max(12),
    actual: z.array(pointSchema).max(12),
    metrics: metricsSchema,
  })
  .strict();
export const runtimeResultSchema = z
  .object({
    version: z.literal(FORECAST_VERSION),
    status: z.enum(['supported', 'fallback']),
    selectedModel: z.enum(modelNames).nullable(),
    reason: z.string().max(500),
    points: z.array(pointSchema).max(12),
    candidates: z
      .array(
        z
          .object({
            model: z.enum(modelNames),
            modelVersion: z.literal('fixed-1'),
            configuration: z.record(z.string(), z.union([z.string(), z.number()])),
            status: z.enum(['succeeded', 'failed', 'not_applicable']),
            reason: z.string().max(300),
            metrics: metricsSchema.nullable(),
            folds: z.array(evaluationSchema).max(3),
            points: z.array(pointSchema).max(12),
          })
          .strict(),
      )
      .length(4),
    uncertainty: z.object({ kind: z.literal('unavailable'), reason: z.string() }).strict(),
    runtime: z
      .object({
        python: z.string(),
        implementation: z.string(),
        decimalPrecision: z.literal(40),
        algorithmVersion: z.literal('fixed-1'),
      })
      .strict(),
  })
  .strict();
export type RuntimeResult = z.infer<typeof runtimeResultSchema>;
export const compositionSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(100),
    templateVersionId: idSchema,
    artifactId: idSchema.nullable(),
    approvalId: idSchema.nullable(),
    componentKey: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),
    origin: periodSchema,
    horizon: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    title: z.string().trim().min(1).max(120),
    mode: z.enum(['forecast', 'assumption']),
    assumptionValues: z.array(moneySchema).max(12),
    note: z.string().trim().min(1).max(500),
    cashTreatment: planningEntrySchema.shape.cashTreatment,
    category: planningEntrySchema.shape.category,
    effect: planningEntrySchema.shape.effect,
    replaceEntryIds: z.array(idSchema).max(150),
    sourcesReviewed: z.literal(true),
  })
  .strict();
export type Composition = z.infer<typeof compositionSchema>;
export type Assignment = {
  entryId: string;
  componentKey: string;
  period: string;
  effect: string;
  source: string;
  planningVersionId: string | null;
  artifactId: string | null;
  approvalId: string | null;
};
export type Composed = {
  document: z.infer<typeof planningDocumentSchema>;
  assignments: Assignment[];
};
