import { providerPhrases } from './grounding.js';
import { z } from 'zod';
import { currencySchema, periodSchema, dateSchema, rateSchema } from '../../contracts/src/index.js';
import {
  categories,
  effects,
  nonnegativeMoney,
  driverSchema,
  treatmentSchema,
} from '../../planning/src/model.js';
import { decisionTypes } from '../../scenarios/src/model.js';

export const AI_SCHEMA_VERSION = 'm7-1';
export const AI_CONSENT_VERSION = 'groq-minimal-context-1';
export const AI_PROMPT_VERSION = 'm7-reviewed-evidence-8';
export const aiTasks = [
  'scenario_extract',
  'assumption_review',
  'result_explain',
  'brief_narrative',
] as const;
export type AiTask = (typeof aiTasks)[number];
const alias = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/);
const shortText = z.string().trim().min(1).max(500);
export const aiSourceSchema = z
  .object({
    kind: z.enum([
      'published_baseline',
      'scenario_draft',
      'scenario_run',
      'stress_comparison',
      'decision_brief',
    ]),
    id: z.uuid(),
    revision: z.number().int().positive().nullable(),
  })
  .strict();
export const aiRequestSchema = z
  .object({
    task: z.enum(aiTasks),
    locale: z.enum(['en', 'ar']),
    source: aiSourceSchema,
    text: z.string().trim().min(1).max(4000).nullable(),
    priorArtifactId: z.uuid().nullable(),
    answers: z.array(z.object({ questionId: alias, text: shortText }).strict()).max(10),
    consentVersion: z.literal(AI_CONSENT_VERSION),
    idempotencyKey: z.uuid(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const allowed: Record<AiTask, string[]> = {
      scenario_extract: ['published_baseline'],
      assumption_review: ['published_baseline', 'scenario_draft'],
      result_explain: ['scenario_run', 'stress_comparison'],
      brief_narrative: ['decision_brief'],
    };
    if (!allowed[v.task].includes(v.source.kind))
      ctx.addIssue({ code: 'custom', message: 'AI_SOURCE_TASK_MISMATCH' });
    if (v.source.kind === 'scenario_draft' && v.source.revision === null)
      ctx.addIssue({ code: 'custom', message: 'AI_REVISION_REQUIRED' });
    if (v.task === 'scenario_extract' && !v.text && !v.answers.length)
      ctx.addIssue({ code: 'custom', message: 'AI_TEXT_REQUIRED' });
    if (v.answers.length && !v.priorArtifactId)
      ctx.addIssue({ code: 'custom', message: 'AI_PRIOR_ARTIFACT_REQUIRED' });
  });
export type AiRequest = z.infer<typeof aiRequestSchema>;
export type AiSource = z.infer<typeof aiSourceSchema>;

const cash = z
  .object({
    period: periodSchema,
    activityPeriod: periodSchema,
    amount: nonnegativeMoney,
    date: dateSchema.nullable(),
  })
  .strict();
// UUIDs, source classifications and confirmation flags are intentionally absent from model input/output.
const entry = z
  .object({
    componentKey: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,59}$/)
      .nullable(),
    category: z.enum(categories).nullable(),
    effect: z.enum(effects).nullable(),
    start: periodSchema.nullable(),
    end: periodSchema.nullable(),
    date: dateSchema.nullable(),
    driver: driverSchema.nullable(),
    cashTreatment: treatmentSchema.nullable(),
    committed: z.boolean().nullable(),
    openingObligation: z.boolean().nullable(),
    settles: z.object({ entryAlias: alias, activityPeriod: periodSchema }).strict().nullable(),
  })
  .strict();
export const aiChangeSchema = z
  .object({
    alias,
    label: z.string().trim().min(1).max(100),
    decision: z.enum(['sales', 'hiring', 'spending', 'expansion']),
    scopeAlias: alias.nullable(),
    currency: currencySchema.nullable(),
    dependencies: z.array(alias).max(30),
    evidence: z
      .array(z.object({ quote: shortText }).strict())
      .min(1)
      .max(20),
    primitive: z.union([
      z
        .object({
          kind: z.literal('adjust'),
          targetAlias: alias.nullable(),
          start: periodSchema.nullable(),
          end: periodSchema.nullable(),
          operation: z
            .enum([
              'set',
              'add',
              'subtract',
              'percentage_increase',
              'percentage_decrease',
              'remove',
            ])
            .nullable(),
          value: z
            .string()
            .regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,12})?$/)
            .refine((v) => nonnegativeMoney.safeParse(v).success || rateSchema.safeParse(v).success)
            .nullable(),
          cashReplacement: z.array(cash).max(36).nullable(),
        })
        .strict(),
      z.object({ kind: z.literal('entry'), entry }).strict(),
    ]),
  })
  .strict();
const scenario = z
  .object({
    title: z.string().trim().min(1).max(120).nullable(),
    decisionType: z.enum(decisionTypes).nullable(),
    changes: z.array(aiChangeSchema).max(30),
    expansion: z
      .object({ revenueMode: z.enum(['modeled', 'excluded_unknown']).nullable(), note: shortText })
      .strict()
      .nullable(),
    paybackRequested: z.boolean().nullable(),
  })
  .strict();
const review = z
  .object({
    issues: z
      .array(
        z
          .object({
            code: alias,
            severity: z.enum(['info', 'review_required']),
            assumptionRef: alias,
            message: shortText,
            question: shortText.nullable(),
            evidenceRefs: z.array(alias).max(20),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
const narrative = z
  .object({
    sections: z
      .array(
        z
          .object({
            heading: z.string().min(1).max(120),
            segments: z
              .array(
                z
                  .object({
                    kind: z.enum(['text', 'fact_ref']),
                    text: shortText.nullable(),
                    factRef: alias.nullable(),
                  })
                  .strict(),
              )
              .min(1)
              .max(12),
          })
          .strict(),
      )
      .max(6),
    limitations: z.array(shortText).max(10),
  })
  .strict();
const common = {
  schemaVersion: z.literal(AI_SCHEMA_VERSION),
  outcome: z.enum(['ready', 'needs_clarification', 'unsupported']),
  summary: z.string().max(1000),
  questions: z
    .array(
      z.object({ id: alias, field: shortText, question: shortText, reason: shortText }).strict(),
    )
    .max(10),
  warnings: z
    .array(
      z.object({ code: alias, message: shortText, evidenceRefs: z.array(alias).max(20) }).strict(),
    )
    .max(10),
};
export const aiOutputSchemas = {
  scenario_extract: z
    .object({ ...common, task: z.literal('scenario_extract'), payload: scenario })
    .strict(),
  assumption_review: z
    .object({ ...common, task: z.literal('assumption_review'), payload: review })
    .strict(),
  result_explain: z
    .object({ ...common, task: z.literal('result_explain'), payload: narrative })
    .strict(),
  brief_narrative: z
    .object({ ...common, task: z.literal('brief_narrative'), payload: narrative })
    .strict(),
};
export type AiOutput = z.infer<(typeof aiOutputSchemas)[AiTask]>;
export type AiChange = z.infer<typeof aiChangeSchema>;
// Provider transport only: named slots avoid ambiguous overlapping object unions.
// Exactly one populated slot is required locally before the unchanged public schema.
export const extractionWireSchema = aiOutputSchemas.scenario_extract
  .extend({
    wireVersion: z.literal('extraction-slots-1'),
    payload: scenario.extend({
      changes: z
        .array(
          aiChangeSchema.extend({
            primitive: z
              .object({
                adjust: aiChangeSchema.shape.primitive.options[0].omit({ kind: true }).nullable(),
                entry: entry.nullable(),
              })
              .strict(),
          }),
        )
        .max(30),
    }),
  })
  .strict();
export function decodeExtractionWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !('wireVersion' in raw)) return raw;
  const wire = extractionWireSchema.parse(raw);
  const { wireVersion: _version, ...output } = wire;
  void _version;
  return {
    ...output,
    payload: {
      ...output.payload,
      changes: output.payload.changes.map((c) => {
        const { adjust, entry: newEntry } = c.primitive;
        if ((adjust === null) === (newEntry === null)) throw new Error('AI_PRIMITIVE_CONFLICT');
        return {
          ...c,
          primitive: adjust ? { kind: 'adjust', ...adjust } : { kind: 'entry', entry: newEntry },
        };
      }),
    },
  };
}
export function providerSchema(
  task: AiTask,
  factRefs?: string[],
  locale?: 'en' | 'ar',
): Record<string, unknown> {
  if (task !== 'scenario_extract') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['task', 'payload'],
      properties: {
        task: { type: 'string', enum: [task] },
        payload: {
          type: 'object',
          additionalProperties: false,
          required: ['claims'],
          properties: {
            claims: {
              type: 'array',
              minItems: 1,
              maxItems: 6,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['kind', 'ref'],
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['reported', 'unavailable', 'assumption', 'schedule'],
                  },
                  ref: { type: 'string', ...(factRefs?.length ? { enum: factRefs } : {}) },
                },
              },
            },
          },
        },
      },
    };
  }
  // Groq requires nullable discriminated object variants in a flat anyOf.
  // Existing unions have disjoint literal kind discriminators, so oneOf -> anyOf is equivalent.
  function compatible(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(compatible);
    if (!value || typeof value !== 'object') return value;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value))
      output[key === 'oneOf' ? 'anyOf' : key] = compatible(child);
    if (factRefs?.length && output.properties && typeof output.properties === 'object') {
      const props = output.properties as Record<string, unknown>;
      if (props.assumptionRef) props.assumptionRef = { type: 'string', enum: factRefs };
      if (props.factRef)
        props.factRef = { anyOf: [{ type: 'string', enum: factRefs }, { type: 'null' }] };
      if (props.evidenceRefs)
        props.evidenceRefs = {
          type: 'array',
          items: { type: 'string', enum: factRefs },
          maxItems: 20,
        };
    }
    if ((task === 'result_explain' || task === 'brief_narrative') && output.properties) {
      const props = output.properties as Record<string, Record<string, unknown>>;
      const pattern = '^[^0-9\u0660-\u0669\u06f0-\u06f9]*$';
      for (const name of ['summary', 'heading', 'text', 'message'])
        if (props[name]) props[name] = { ...props[name], pattern };
      if (props.limitations)
        props.limitations = {
          ...props.limitations,
          items: { ...(props.limitations.items as object), pattern },
        };
    }
    if (output.properties && typeof output.properties === 'object') {
      const props = output.properties as Record<string, Record<string, unknown>>;
      for (const key of [
        'summary',
        'heading',
        'text',
        'message',
        'question',
        'reason',
        'title',
        'label',
        'note',
      ]) {
        if (!props[key]) continue;
        const nullable =
          Array.isArray(props[key].anyOf) ||
          (Array.isArray(props[key].type) && props[key].type.includes('null'));
        const phrase = { type: 'string', enum: providerPhrases(key, locale) };
        props[key] = nullable
          ? { type: ['string', 'null'], enum: [...providerPhrases(key, locale), null] }
          : phrase;
      }
      if (props.limitations)
        props.limitations = {
          ...props.limitations,
          items: { type: 'string', enum: providerPhrases('limitations', locale) },
        };
    }
    if (Array.isArray(output.anyOf))
      output.anyOf = output.anyOf.flatMap((v) => {
        const branch = v as Record<string, unknown>;
        return Array.isArray(branch.anyOf) && Object.keys(branch).length === 1
          ? branch.anyOf
          : [branch];
      });
    return output;
  }
  return compatible(z.toJSONSchema(extractionWireSchema, { target: 'draft-7' })) as Record<
    string,
    unknown
  >;
}
