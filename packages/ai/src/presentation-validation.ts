import type { AiOutput } from './model.js';
import type { AiEvidence } from './validation.js';
import { evidencePresentation, explanationText, explanationKind } from './presentation.js';
/** Every explanatory sentence must match the predicate of the referenced evidence. */
export function validatePresentation(output: AiOutput, evidence: AiEvidence, locale: 'en' | 'ar') {
  if (output.task === 'scenario_extract') return;
  const selected =
    output.task === 'assumption_review'
      ? output.payload.issues.map((i) => i.assumptionRef)
      : output.payload.sections.flatMap((s) =>
          s.segments.filter((v) => v.kind === 'fact_ref').map((v) => v.factRef!),
        );
  if (
    output.outcome === 'ready' &&
    Object.values(evidence.facts).some((f) => explanationKind(f) !== 'evidence') &&
    !selected.some((r) => explanationKind(evidence.facts[r]) !== 'evidence')
  )
    throw new Error('AI_GENERIC_EXPLANATION');
  const vocabulary = new Set<string>([
    ...Object.values(explanationText.en),
    ...Object.values(explanationText.ar),
  ]);
  if (
    vocabulary.has(output.summary) ||
    output.questions.some((q) => vocabulary.has(q.question) || vocabulary.has(q.reason))
  )
    throw new Error('AI_UNSUPPORTED_CLAIM');
  for (const w of output.warnings)
    if (
      vocabulary.has(w.message) &&
      !(
        output.task === 'assumption_review' &&
        w.code === 'impact_not_quantified' &&
        w.message === explanationText[locale].impact
      )
    )
      throw new Error('AI_UNSUPPORTED_CLAIM');
  if (output.task === 'assumption_review') {
    for (const issue of output.payload.issues) {
      const p = evidencePresentation(issue.assumptionRef, evidence, locale);
      if (p.kind === 'evidence' && !vocabulary.has(issue.message)) continue;
      if (
        issue.message !== p.text ||
        issue.question !== p.question ||
        JSON.stringify(issue.evidenceRefs) !== JSON.stringify(p.refs)
      )
        throw new Error('AI_UNSUPPORTED_CLAIM');
    }
  } else {
    if (output.payload.limitations.some((t) => vocabulary.has(t)))
      throw new Error('AI_UNSUPPORTED_CLAIM');
    for (const section of output.payload.sections) {
      if (vocabulary.has(section.heading)) throw new Error('AI_UNSUPPORTED_CLAIM');
      const refs = section.segments.filter((s) => s.kind === 'fact_ref').map((s) => s.factRef!);
      const text = section.segments.filter((s) => s.kind === 'text').map((s) => s.text!);
      const usesSpecific = text.some((t) => vocabulary.has(t));
      const needsSpecific = refs.some((r) => explanationKind(evidence.facts[r]) !== 'evidence');
      if (!usesSpecific && !needsSpecific) continue;
      if (!refs.length) throw new Error('AI_UNSUPPORTED_CLAIM');
      const p = evidencePresentation(refs[0], evidence, locale);
      const expected = [p.text, ...(p.limitation ? [p.limitation] : [])];
      if (
        JSON.stringify(refs) !== JSON.stringify(p.refs) ||
        JSON.stringify(text) !== JSON.stringify(expected)
      )
        throw new Error('AI_UNSUPPORTED_CLAIM');
    }
  }
}
