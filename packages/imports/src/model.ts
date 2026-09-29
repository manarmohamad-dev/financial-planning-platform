import { z } from 'zod';
import { idSchema, periodSchema, dateSchema } from '../../contracts/src/index.js';
import {
  categories,
  effects,
  planningDocumentSchema,
  type PlanningDocument,
  type CapabilityReport,
} from '../../planning/src/model.js';
export const IMPORT_CONTRACT = 'import-1.0.0';
export const LIMITS = {
  fileBytes: 5 * 1024 * 1024,
  uncompressedBytes: 32 * 1024 * 1024,
  archiveEntries: 250,
  partBytes: 8 * 1024 * 1024,
  rows: 2000,
  columns: 40,
  sheets: 10,
  cellChars: 2000,
  totalCells: 80000,
};
export type Cell = { value: string; kind: 'text' | 'number' | 'boolean' | 'date' | 'blank' };
export type RawSheet = { name: string; rows: Cell[][] };
export type RawImport = {
  type: 'csv' | 'xlsx';
  sheets: RawSheet[];
  warnings: string[];
  parserVersion: typeof IMPORT_CONTRACT;
};
export type Inspection = {
  sheet: string;
  fingerprint: string;
  headers: string[];
  rows: number;
  columns: number;
  sample: { row: number; values: string[] }[];
  types: string[];
  warnings: string[];
  flaggedRows: { row: number; reason: string }[];
  emptyColumns: number[];
};
export const columnRoles = [
  'unreviewed',
  'ignore',
  'period',
  'end_period',
  'currency',
  'basis',
  'scope',
  'label',
  'amount',
  'opening_available',
  'opening_restricted',
] as const;
export const mappingRuleSchema = z
  .object({
    id: idSchema,
    column: z.number().int().min(0).max(39),
    filter: z
      .object({ column: z.number().int().min(0).max(39), value: z.string().min(1).max(200) })
      .strict()
      .nullable(),
    component: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),
    category: z.enum(categories),
    effect: z.enum(effects),
    basis: z.enum(['actual', 'budget', 'forecast', 'assumption', 'schedule']).nullable(),
    approveBudgetAsAssumption: z.boolean(),
    semanticConfirmed: z.boolean(),
    behavior: z.enum(['monthly', 'dated_detail', 'recurring']),
    sign: z.enum(['nonnegative', 'negative_outflow']).nullable(),
    timing: z.enum(['unknown', 'same_month', 'offset', 'non_cash', 'direct_cash']),
    offset: z.number().int().min(0).max(120),
    committed: z.boolean(),
    openingObligation: z.boolean(),
    note: z.string().max(500),
  })
  .strict();
export const mappingSchema = z
  .object({
    contractVersion: z.literal(IMPORT_CONTRACT),
    sheet: z.string().min(1).max(100),
    headerRow: z.number().int().min(1).max(20),
    fingerprint: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    projectionStart: periodSchema,
    horizonMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]),
    requestedOutputs: z
      .array(z.enum(['operating', 'cash']))
      .min(1)
      .max(2),
    numberLocale: z.enum(['decimal_dot', 'decimal_comma']).nullable(),
    dateFormat: z.enum(['iso', 'dmy', 'mdy', 'excel1900', 'excel1904']).nullable(),
    currencyConfirmed: z.boolean(),
    basisConfirmed: z.boolean(),
    scopeConfirmed: z.boolean(),
    columns: z
      .array(
        z
          .object({
            column: z.number().int().min(0).max(39),
            role: z.enum(columnRoles),
            reason: z.string().max(300),
          })
          .strict(),
      )
      .max(40),
    rules: z.array(mappingRuleSchema).max(40),
    excludedRows: z
      .array(
        z
          .object({
            row: z.number().int().min(1).max(2000),
            reason: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(2000),
    reviewedRows: z
      .array(
        z
          .object({
            row: z.number().int().min(1).max(2000),
            reason: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .max(2000),
    coverageFrom: dateSchema.nullable(),
    coverageTo: dateSchema.nullable(),
    coverageReviewed: z.boolean(),
    coverage: planningDocumentSchema.shape.coverage,
    opening: z
      .object({
        available: z.string().max(60).nullable(),
        restricted: z.string().max(60).nullable(),
        source: z.enum(['observed', 'assumption']),
        note: z.string().max(500),
      })
      .strict()
      .nullable(),
    sourceResolution: z
      .object({ mode: z.literal('new_dataset').nullable(), note: z.string().max(500) })
      .strict(),
  })
  .strict();
export type Mapping = z.infer<typeof mappingSchema>;
export type MappingRule = z.infer<typeof mappingRuleSchema>;
export type ImportIssue = {
  code: string;
  severity: 'blocker' | 'warning' | 'information';
  message: string;
  row?: number;
  column?: number;
};
export type Origin = {
  entryId: string | null;
  field: string;
  sheet: string;
  row: number;
  column: number;
  header: string;
  rawValue: string;
  originalBasis: string;
  mappingRuleId: string | null;
};
export type Validation = {
  issues: ImportIssue[];
  canConfirm: boolean;
  document: PlanningDocument | null;
  lineage: Origin[];
  capabilities: CapabilityReport | null;
  evidenceQuality: 'limited' | 'reviewed';
  scenarioCapabilities: { name: string; readiness: string; reason: string }[];
};
export type Suggestion = {
  column: number;
  header: string;
  role: string;
  meaning: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};
