import { describe, it, expect } from 'vitest';
import { materializeClaims, assertGroundedProse } from '../packages/ai/src/grounding.js';
import { validateAiOutput, type AiEvidence } from '../packages/ai/src/validation.js';
import { explanationText } from '../packages/ai/src/presentation.js';
const evidence = (difference = '-16000', status = 'breached'): AiEvidence => ({
  currency: 'EGP',
  entries: {},
  scopes: {},
  facts: {
    d: {
      value: difference,
      label: 'Ending cash difference',
      sourcePath: 'source.comparison.periods[2].metrics.closingCash.difference',
    },
    b: {
      value: '64000',
      label: 'Baseline',
      sourcePath: 'source.comparison.periods[2].metrics.closingCash.baseline',
    },
    s: {
      value: '48000',
      label: 'Scenario',
      sourcePath: 'source.comparison.periods[2].metrics.closingCash.scenario',
    },
    r: {
      value: status,
      label: 'Reserve check',
      sourcePath: 'source.options[1].risk.checks[0].status',
    },
    a: {
      value: 'assumption',
      label: 'Service revenue: Source',
      sourcePath: 'source.entries[0].source',
    },
    v: {
      value: '32000',
      label: 'Service revenue: Amount',
      sourcePath: 'source.entries[0].driver.amount',
    },
    o: { value: 'observed', label: 'Opening cash', sourcePath: 'source.openingCash.source' },
    m: { value: 'not_available', label: 'Funding gap', sourcePath: 'source.fundingGap' },
  },
});
function render(
  e: AiEvidence,
  locale: 'en' | 'ar',
  task: 'result_explain' | 'assumption_review' | 'brief_narrative',
  ref: string,
  kind = 'reported',
) {
  return validateAiOutput(
    task,
    materializeClaims(task, { task, payload: { claims: [{ kind, ref }] } }, e, locale),
    e,
    '',
    locale,
  );
}
describe('M7 specific explanation without model arithmetic', () => {
  it('does not extend extraction prose privileges with evidence-only explanations',()=>{
    expect(()=>assertGroundedProse({task:'scenario_extract',summary:explanationText.en.breached},'en')).toThrow('AI_UNGROUNDED_PROSE');
  });
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: same question different saved differences yields different meaning`, () => {
      const a = render(evidence('-16000'), lang, 'result_explain', 'd');
      const b = render(evidence('12000'), lang, 'result_explain', 'd');
      expect(JSON.stringify(a)).toContain(explanationText[lang].decrease);
      expect(JSON.stringify(b)).toContain(explanationText[lang].increase);
      expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
      expect(JSON.stringify(a)).toContain('"factRef":"b"');
      expect(JSON.stringify(a)).toContain('"factRef":"s"');
    });
    it(`${lang}: uses engine difference without recomputation`, () => {
      const e = evidence('777'); // Intentionally not b-s: the assistant must copy, never repair engine data.
      const o = render(e, lang, 'brief_narrative', 'd');
      expect(JSON.stringify(o)).not.toContain('16000');
      expect(e.facts.d.value).toBe('777');
    });
    it(`${lang}: risk wording follows saved check, not a guessed score`, () => {
      expect(JSON.stringify(render(evidence(), lang, 'result_explain', 'r'))).toContain(
        explanationText[lang].breached,
      );
      expect(JSON.stringify(render(evidence('0', 'met'), lang, 'result_explain', 'r'))).toContain(
        explanationText[lang].met,
      );
    });
    it(`${lang}: actual assumption has input evidence and human clarification`, () => {
      const o = render(evidence(), lang, 'assumption_review', 'a', 'assumption');
      expect(JSON.stringify(o)).toContain(explanationText[lang].askAssumption);
      expect(JSON.stringify(o)).toContain('"v"');
      expect(JSON.stringify(o)).toContain(explanationText[lang].impact);
      expect(JSON.stringify(render(evidence(), lang, 'assumption_review', 'o'))).toContain(
        explanationText[lang].observed,
      );
    });
    it(`${lang}: missing stays unavailable with clarification`, () => {
      const o = render(evidence(), lang, 'assumption_review', 'm', 'unavailable');
      expect(JSON.stringify(o)).toContain(explanationText[lang].askMissing);
      expect(evidence().facts.m.value).toBe('not_available');
    });
    it(`${lang}: rejects swapping an allowed sentence onto contradictory evidence`, () => {
      const e = evidence();
      const o = render(e, lang, 'result_explain', 'r');
      if (o.task !== 'result_explain') throw new Error();
      o.payload.sections[0].segments[0].text = explanationText[lang].met;
      expect(() => validateAiOutput('result_explain', o, e, '', lang)).toThrow();
    });
  }
  it('rejects repeated references and generic explanation when specific evidence is present', () => {
    const e = evidence();
    expect(() =>
      materializeClaims(
        'result_explain',
        {
          task: 'result_explain',
          payload: {
            claims: [
              { kind: 'reported', ref: 'd' },
              { kind: 'reported', ref: 'd' },
            ],
          },
        },
        e,
        'en',
      ),
    ).toThrow();
    const o = render(e, 'en', 'result_explain', 'd');
    if (o.task !== 'result_explain') throw new Error();
    o.payload.sections[0].segments[0].text = 'Evidence from the selected source.';
    expect(() => validateAiOutput('result_explain', o, e, '', 'en')).toThrow();
  });
  it('rejects financial conclusion smuggled into summary or limitations', () => {
    const e = evidence();
    for (const location of ['summary', 'limitations']) {
      const o = render(e, 'en', 'result_explain', 'r');
      if (o.task !== 'result_explain') throw new Error();
      if (location === 'summary') o.summary = explanationText.en.met;
      else o.payload.limitations = [explanationText.en.met];
      expect(() => validateAiOutput('result_explain', o, e, '', 'en')).toThrow();
    }
  });
  it('does not allow a fabricated assumption kind or model-supplied calculation', () => {
    expect(() => render(evidence(), 'en', 'assumption_review', 'o', 'assumption')).toThrow();
    expect(() =>
      materializeClaims(
        'result_explain',
        {
          task: 'result_explain',
          payload: { claims: [{ kind: 'reported', ref: 'd', calculatedDifference: '16000' }] },
        },
        evidence(),
        'en',
      ),
    ).toThrow();
  });
});
