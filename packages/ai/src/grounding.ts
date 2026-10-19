import { evidencePresentation, explanationText } from './presentation.js';
import { z } from 'zod';
import type { AiEvidence } from './validation.js';
import type { AiTask } from './model.js';
/** Closed vocabulary: model prose is not treated as financial evidence. */
export const safePhrases = {
  en: [
    'Reviewed evidence',
    'Review proposal',
    'Review the explicit inputs.',
    'Evidence from the selected source.',
    'Information may be unavailable; review the referenced evidence.',
    'Review this input.',
    'Please review the referenced input.',
    'Assumptions require review.',
    'This is not a recommendation.',
    'Cash',
    'Evidence',
    'Inputs',
    'Limitations',
    'Proposal',
    'Reviewed change',
    'Synthetic reviewed scenario',
    'Sales amount',
    'Sales change',
    'Hiring change',
    'Spending change',
    'Expansion change',
    'Please provide the missing details.',
    'Please specify salary and timing.',
    'What salary?',
    'Salary?',
    'What amount?',
    'What currency?',
    'What period?',
    'What payment timing?',
    'What scope?',
    'What commitment status?',
    'Is payback requested?',
    'Please clarify the proposed change.',
    'Required input',
    'Missing',
    'This request is not supported.',
    '.',
  ],
  ar: [
    'شرح الأدلة',
    'مراجعة المقترح',
    'راجع المدخلات الصريحة.',
    'أدلة من المصدر المحدد.',
    'قد تكون المعلومات غير متاحة؛ راجع الأدلة المشار إليها.',
    'راجع هذا المدخل.',
    'يرجى مراجعة المدخل المشار إليه.',
    'تحتاج الافتراضات للمراجعة',
    'هذه ليست توصية.',
    'النقد',
    'الأدلة',
    'المدخلات',
    'القيود',
    'مقترح',
    'تغيير للمراجعة',
    'تغيير المبيعات',
    'تغيير التوظيف',
    'تغيير المصروفات',
    'تغيير التوسع',
    'يرجى تقديم التفاصيل الناقصة.',
    'يرجى تحديد الراتب والتوقيت.',
    'ما الراتب؟',
    'ما المبلغ؟',
    'ما العملة؟',
    'ما الفترة؟',
    'ما توقيت الدفع؟',
    'ما النطاق؟',
    'ما حالة الالتزام؟',
    'هل تريد حساب الاسترداد؟',
    'يرجى توضيح التغيير المقترح.',
    'مدخل مطلوب',
    'غير محدد',
    'هذا الطلب غير مدعوم.',
    '.',
  ],
} as const;
export function groundedPhrases(locale?: 'en' | 'ar'): readonly string[] {
  return locale
    ? [...safePhrases[locale], ...Object.values(explanationText[locale])]
    : [
        ...safePhrases.en,
        ...safePhrases.ar,
        ...Object.values(explanationText.en),
        ...Object.values(explanationText.ar),
      ];
}
/** Applied to every displayed model-written string, not just numerical claims. */
export function assertGroundedProse(output: unknown, locale?: 'en' | 'ar'): void {
  const isExtraction = !!output && typeof output === 'object' && 'task' in output && output.task === 'scenario_extract';
  const allowed = new Set(isExtraction ? (locale ? safePhrases[locale] : [...safePhrases.en,...safePhrases.ar]) : groundedPhrases(locale));
  const prose = new Set([
    'summary',
    'heading',
    'text',
    'message',
    'question',
    'reason',
    'title',
    'label',
    'note',
  ]);
  function visit(value: unknown, key = ''): void {
    if (value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, key));
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as object)) visit(v, k);
      return;
    }
    if (
      (prose.has(key) || key === 'limitations') &&
      typeof value === 'string' &&
      !allowed.has(value)
    )
      throw new Error('AI_UNGROUNDED_PROSE');
  }
  visit(output);
}

export function providerPhrases(field: string, locale?: 'en' | 'ar'): readonly string[] {
  // Language arrays intentionally differ; explicit field vocabulary avoids ambiguous index mapping.
  const ar: Record<string, string[]> = {
    summary: [
      'شرح الأدلة',
      'مراجعة المقترح',
      'يرجى تقديم التفاصيل الناقصة.',
      'هذا الطلب غير مدعوم.',
    ],
    heading: ['الأدلة', 'المدخلات', 'القيود'],
    text: ['أدلة من المصدر المحدد.', 'قد تكون المعلومات غير متاحة؛ راجع الأدلة المشار إليها.'],
    limitations: ['تحتاج الافتراضات للمراجعة', 'هذه ليست توصية.'],
    message: ['راجع هذا المدخل.'],
    question: [
      'ما الراتب؟',
      'ما المبلغ؟',
      'ما العملة؟',
      'ما الفترة؟',
      'ما توقيت الدفع؟',
      'ما النطاق؟',
      'ما حالة الالتزام؟',
      'هل تريد حساب الاسترداد؟',
      'يرجى توضيح التغيير المقترح.',
    ],
    reason: ['مدخل مطلوب'],
    title: ['مقترح'],
    label: ['تغيير للمراجعة'],
    note: ['تحتاج الافتراضات للمراجعة'],
  };
  const en: Record<string, string[]> = {
    summary: [
      'Reviewed evidence',
      'Review proposal',
      'Please provide the missing details.',
      'This request is not supported.',
    ],
    heading: ['Evidence', 'Inputs', 'Limitations'],
    text: [
      'Evidence from the selected source.',
      'Information may be unavailable; review the referenced evidence.',
    ],
    limitations: ['Assumptions require review.', 'This is not a recommendation.'],
    message: ['Review this input.'],
    question: [
      'What salary?',
      'What amount?',
      'What currency?',
      'What period?',
      'What payment timing?',
      'What scope?',
      'What commitment status?',
      'Is payback requested?',
      'Please clarify the proposed change.',
    ],
    reason: ['Required input'],
    title: ['Proposal'],
    label: ['Reviewed change'],
    note: ['Assumptions require review.'],
  };
  return locale === 'ar' ? ar[field] : locale === 'en' ? en[field] : [...en[field], ...ar[field]];
}

export class GroundingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export const claimWire = z
  .object({
    task: z.enum(['assumption_review', 'result_explain', 'brief_narrative']),
    payload: z
      .object({
        claims: z
          .array(
            z
              .object({
                kind: z.enum(['reported', 'unavailable', 'assumption', 'schedule']),
                ref: z.string(),
              })
              .strict(),
          )
          .min(1)
          .max(6),
      })
      .strict(),
  })
  .strict();
export function materializeClaims(
  task: AiTask,
  raw: unknown,
  evidence: AiEvidence,
  locale: 'en' | 'ar',
) {
  if (task === 'scenario_extract') return raw;
  const wire = claimWire.parse(raw);
  if (new Set(wire.payload.claims.map((c) => c.ref)).size !== wire.payload.claims.length)
    throw new GroundingError('AI_REPEATED_EVIDENCE');
  if (wire.task !== task) throw new GroundingError('AI_SOURCE_TASK_MISMATCH');
  for (const claim of wire.payload.claims) {
    const fact = evidence.facts[claim.ref];
    if (!fact) throw new GroundingError('AI_UNKNOWN_EVIDENCE');
    const missing = ['not_available', 'unavailable', 'unknown', 'not_supported'].includes(
      fact.value,
    );
    if (claim.kind === 'unavailable' ? !missing : missing)
      throw new GroundingError('AI_UNSUPPORTED_CLAIM');
    if (claim.kind === 'assumption' && fact.value !== 'assumption')
      throw new GroundingError('AI_UNSUPPORTED_CLAIM');
    if (claim.kind === 'schedule' && fact.value !== 'schedule')
      throw new GroundingError('AI_UNSUPPORTED_CLAIM');
  }
  const ar = locale === 'ar';
  return {
    schemaVersion: 'm7-1',
    task,
    outcome: 'ready',
    summary: ar ? 'شرح الأدلة' : 'Reviewed evidence',
    questions: [],
    warnings:
      task === 'assumption_review'
        ? [
            {
              code: 'impact_not_quantified',
              message: explanationText[locale].impact,
              evidenceRefs: wire.payload.claims.map((c) => c.ref),
            },
          ]
        : [],
    payload:
      task === 'assumption_review'
        ? {
            issues: wire.payload.claims.map((claim) => {
              const p = evidencePresentation(claim.ref, evidence, locale);
              return {
                code: 'review_' + p.kind,
                severity: ['observed', 'schedule'].includes(p.kind) ? 'info' : 'review_required',
                assumptionRef: claim.ref,
                message: p.text,
                question: p.question,
                evidenceRefs: p.refs,
              };
            }),
          }
        : {
            sections: wire.payload.claims.map((claim) => {
              const p = evidencePresentation(claim.ref, evidence, locale);
              return {
                heading: ar ? 'الأدلة' : 'Evidence',
                segments: [
                  { kind: 'text', text: p.text, factRef: null },
                  ...p.refs.map((ref) => ({ kind: 'fact_ref', text: null, factRef: ref })),
                  ...(p.limitation ? [{ kind: 'text', text: p.limitation, factRef: null }] : []),
                ],
              };
            }),
            limitations: ar
              ? ['تحتاج الافتراضات للمراجعة', 'هذه ليست توصية.']
              : ['Assumptions require review.', 'This is not a recommendation.'],
          },
  };
}
