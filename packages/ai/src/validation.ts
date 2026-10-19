import { assertGroundedProse } from './grounding.js';
import { validatePresentation } from './presentation-validation.js';
import { aiOutputSchemas, decodeExtractionWire, type AiOutput, type AiTask } from './model.js';
import { assertIntentCompleteness } from './intent-completeness.js';
import { Decimal } from 'decimal.js';

export type AiEvidence = {
  facts: Record<
    string,
    {
      value: string;
      label: string;
      sourcePath: string;
      metricPath?: string;
      unit?: string | null;
      period?: string | null;
    }
  >;
  entries: Record<string, string>;
  scopes: Record<string, { kind: 'company' } | { kind: 'branch' | 'department'; id: string }>;
  currency: string;
};
export class AiValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
}
export function validateAiOutput(
  task: AiTask,
  raw: unknown,
  evidence: AiEvidence,
  userText: string,
  locale?: 'en' | 'ar',
): AiOutput {
  let decoded = raw;
  try {
    if (task === 'scenario_extract') decoded = decodeExtractionWire(raw);
  } catch {
    throw new AiValidationError('AI_OUTPUT_INVALID');
  }
  const parsed = aiOutputSchemas[task].safeParse(decoded);
  if (!parsed.success) throw new AiValidationError('AI_OUTPUT_INVALID');
  const value = parsed.data;
  if (locale === 'ar') {
    const userFacing = [
      value.summary,
      ...value.questions.flatMap((q) => [q.question, q.reason]),
      ...value.warnings.map((w) => w.message),
    ];
    if (value.task === 'result_explain' || value.task === 'brief_narrative')
      userFacing.push(
        ...value.payload.limitations,
        ...value.payload.sections.flatMap((s) => [
          s.heading,
          ...s.segments.filter((v) => v.kind === 'text').map((v) => v.text ?? ''),
        ]),
      );
    if (value.task === 'scenario_extract')
      userFacing.push(value.payload.title ?? '', ...value.payload.changes.map((c) => c.label));
    if (value.task === 'assumption_review')
      userFacing.push(...value.payload.issues.flatMap((i) => [i.message, i.question ?? '']));
    if (userFacing.some((s) => /\p{L}/u.test(s) && !/[\u0621-\u064a]/.test(s)))
      throw new AiValidationError('AI_LANGUAGE_MISMATCH');
  }
  const known = (ref: string) => Object.hasOwn(evidence.facts, ref);
  const requireRef = (ref: string) => {
    if (!known(ref)) throw new AiValidationError('AI_UNKNOWN_EVIDENCE');
  };
  for (const warning of value.warnings) warning.evidenceRefs.forEach(requireRef);
  if (value.outcome === 'needs_clarification' && !value.questions.length)
    throw new AiValidationError('AI_MISSING_QUESTION');
  if (value.outcome === 'ready' && value.questions.length)
    throw new AiValidationError('AI_CONFLICTING_OUTCOME');
  if (value.task === 'result_explain' || value.task === 'brief_narrative') {
    const plain = [
      value.summary,
      ...value.payload.limitations,
      ...value.warnings.map((w) => w.message),
    ];
    for (const section of value.payload.sections) {
      plain.push(section.heading);
      for (const segment of section.segments) {
        if (segment.kind === 'fact_ref') {
          if (segment.text !== null || !segment.factRef)
            throw new AiValidationError('AI_INVALID_FACT_SEGMENT');
          requireRef(segment.factRef);
        } else {
          if (segment.factRef !== null || !segment.text)
            throw new AiValidationError('AI_INVALID_TEXT_SEGMENT');
          plain.push(segment.text);
        }
      }
    }
    if (plain.some((text) => /\d/.test(normalizeDigits(text))))
      throw new AiValidationError('AI_UNREFERENCED_NUMBER');
  } else if (value.task === 'assumption_review') {
    for (const issue of value.payload.issues) {
      requireRef(issue.assumptionRef);
      issue.evidenceRefs.forEach(requireRef);
    }
  } else {
    const normalizedText = normalizeDigits(userText).replace(/٫/g, '.').replace(/٬/g, ',');
    const numericEvidence = new Set<string>();
    const ratioEvidence = new Set<string>();
    const amountEvidence = new Set<string>();
    for (const match of normalizedText
      .replace(/\d{4}-\d{2}(?:-\d{2})?/g, '')
      .matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?\s*[%٪]?/g)) {
      const token = match[0].trim(),
        percent = /[%٪]$/.test(token);
      const amount = token.replace(/[,\s%٪]/g, '');
      numericEvidence.add(new Decimal(amount).toString());
      if (percent) {
        const ratio = new Decimal(amount).div(100).toString();
        numericEvidence.add(ratio);
        ratioEvidence.add(ratio);
      } else {
        amountEvidence.add(new Decimal(amount).toString());
        if (new Decimal(amount).abs().lte(1) || amount.includes('.'))
          ratioEvidence.add(new Decimal(amount).toString());
      }
    }
    const assertNumbers = (v: unknown, key = '') => {
      if (v === null) return;
      if (Array.isArray(v)) {
        v.forEach((x) => assertNumbers(x, key));
        return;
      }
      if (v && typeof v === 'object') {
        Object.entries(v).forEach(([k, x]) => assertNumbers(x, k));
        return;
      }
      if (
        ['start', 'end', 'period', 'activityPeriod', 'date'].includes(key) &&
        typeof v === 'string' &&
        !normalizedText.includes(v)
      )
        throw new AiValidationError('AI_UNSUPPORTED_INPUT_VALUE');
      if (
        [
          'value',
          'amount',
          'count',
          'monthlyCost',
          'onboardingCost',
          'rate',
          'offsetMonths',
          'proportion',
        ].includes(key) &&
        (typeof v === 'string' || typeof v === 'number') &&
        !numericEvidence.has(new Decimal(v).toString())
      )
        throw new AiValidationError('AI_UNSUPPORTED_INPUT_VALUE');
      if (
        ['amount', 'count', 'monthlyCost', 'onboardingCost', 'offsetMonths'].includes(key) &&
        (typeof v === 'string' || typeof v === 'number') &&
        !amountEvidence.has(new Decimal(v).toString())
      )
        throw new AiValidationError('AI_UNSUPPORTED_INPUT_VALUE');
      if (
        ['rate', 'proportion'].includes(key) &&
        (typeof v === 'string' || typeof v === 'number') &&
        !ratioEvidence.has(new Decimal(v).toString())
      )
        throw new AiValidationError('AI_PERCENTAGE_UNIT_MISMATCH');
    };
    const aliases = new Set(value.payload.changes.map((c) => c.alias));
    if (aliases.size !== value.payload.changes.length)
      throw new AiValidationError('AI_DUPLICATE_ALIAS');
    const visiting = new Set<string>(),
      visited = new Set<string>();
    function visit(alias: string) {
      if (visiting.has(alias)) throw new AiValidationError('AI_DEPENDENCY_CYCLE');
      if (visited.has(alias)) return;
      visiting.add(alias);
      if (value.task === 'scenario_extract')
        value.payload.changes.find((c) => c.alias === alias)?.dependencies.forEach(visit);
      visiting.delete(alias);
      visited.add(alias);
    }
    aliases.forEach(visit);
    for (const change of value.payload.changes) {
      assertNumbers(change.primitive);
      if (change.currency !== null && change.currency !== evidence.currency)
        throw new AiValidationError('AI_CURRENCY_MISMATCH');
      if (change.scopeAlias !== null && !Object.hasOwn(evidence.scopes, change.scopeAlias))
        throw new AiValidationError('AI_UNKNOWN_SCOPE');
      if (change.dependencies.some((d) => !aliases.has(d) || d === change.alias))
        throw new AiValidationError('AI_UNKNOWN_DEPENDENCY');
      if (change.evidence.some((e) => !userText.includes(e.quote)))
        throw new AiValidationError('AI_FABRICATED_QUOTE');
      const primitive = change.primitive;
      if (
        primitive.kind === 'adjust' &&
        primitive.operation?.startsWith('percentage_') &&
        primitive.value !== null &&
        !ratioEvidence.has(new Decimal(primitive.value).toString())
      )
        throw new AiValidationError('AI_PERCENTAGE_UNIT_MISMATCH');
      if (
        primitive.kind === 'adjust' &&
        !primitive.operation?.startsWith('percentage_') &&
        primitive.value !== null &&
        !amountEvidence.has(new Decimal(primitive.value).toString())
      )
        throw new AiValidationError('AI_UNSUPPORTED_INPUT_VALUE');
      if (
        primitive.kind === 'adjust' &&
        primitive.targetAlias !== null &&
        !Object.hasOwn(evidence.entries, primitive.targetAlias)
      )
        throw new AiValidationError('AI_UNKNOWN_ENTRY');
      if (
        primitive.kind === 'entry' &&
        primitive.entry.settles &&
        !Object.hasOwn(evidence.entries, primitive.entry.settles.entryAlias)
      )
        throw new AiValidationError('AI_UNKNOWN_ENTRY');
      if (value.outcome === 'ready') {
        if (!change.currency || !change.scopeAlias) throw new AiValidationError('AI_MISSING_INPUT');
        if (
          primitive.kind === 'adjust' &&
          (!primitive.targetAlias ||
            !primitive.start ||
            !primitive.end ||
            !primitive.operation ||
            (primitive.operation !== 'remove' && primitive.value === null))
        )
          throw new AiValidationError('AI_MISSING_INPUT');
        if (primitive.kind === 'entry') {
          const e = primitive.entry;
          if (
            !e.componentKey ||
            !e.category ||
            !e.effect ||
            !e.start ||
            !e.end ||
            !e.driver ||
            !e.cashTreatment ||
            e.committed === null ||
            e.openingObligation === null
          )
            throw new AiValidationError('AI_MISSING_INPUT');
          if (e.driver && Object.values(e.driver).includes(null))
            throw new AiValidationError('AI_MISSING_INPUT');
        }
      }
    }
    if (
      value.outcome === 'ready' &&
      (!value.payload.title ||
        !value.payload.decisionType ||
        !value.payload.changes.length ||
        value.payload.paybackRequested === null)
    )
      throw new AiValidationError('AI_MISSING_INPUT');
  }
  if (value.task === 'scenario_extract') {
    try {
      assertIntentCompleteness(value, userText);
    } catch {
      throw new AiValidationError('AI_INTENT_INCOMPLETE');
    }
  }
  try {
    assertGroundedProse(value, locale);
    validatePresentation(value, evidence, locale ?? 'en');
  } catch {
    throw new AiValidationError('AI_UNGROUNDED_PROSE');
  }
  return value;
}
