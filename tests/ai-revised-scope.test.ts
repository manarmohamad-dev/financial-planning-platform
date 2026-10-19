import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { createAiService, assertRiskSelection } from '../apps/api/src/ai-service.js';
import { materializeClaims } from '../packages/ai/src/grounding.js';
import { validateAiOutput, type AiEvidence } from '../packages/ai/src/validation.js';
import { explanationText } from '../packages/ai/src/presentation.js';
describe('revised scope defense and saved risk evidence', () => {
  it('direct service invocation cannot bypass extraction retirement', async () => {
    const provider = vi.fn();
    const db = { connect: vi.fn() };
    await expect(
      createAiService(db as unknown as Pool, provider)('actor', 'workspace', 'request', {
        task: 'scenario_extract',
        locale: 'en',
        source: { kind: 'published_baseline', id: 'id', revision: null },
        text: 'Hire staff',
        answers: [],
        priorArtifactId: null,
        consentVersion: 'groq-minimal-context-1',
        idempotencyKey: 'id',
      }),
    ).rejects.toMatchObject({ code: 'AI_EXTRACTION_RETIRED' });
    expect(provider).not.toHaveBeenCalled();
    expect(db.connect).not.toHaveBeenCalled();
  });
  for (const locale of ['en', 'ar'] as const) {
    it(`${locale}: interprets actual saved risk statuses, rejects unrelated cash`, () => {
      // Transcribed shape from saved risk evidence; no ignored runtime artifact dependency.
      const evidence: AiEvidence = {
        currency: 'EGP',
        entries: {},
        scopes: {},
        facts: {
          f3: {
            value: '64000.00',
            label: 'Pinned baseline: Ending cash',
            sourcePath: 'source.options[0].financial.periods[2].closingCash',
          },
          f8: {
            value: 'met',
            label: 'Pinned baseline: cash_negative',
            sourcePath: 'source.options[0].risk.checks[0].status',
          },
          f9: {
            value: 'breached',
            label: 'Scenario: cash_reserve',
            sourcePath: 'source.options[1].risk.checks[1].status',
          },
          f10: {
            value: 'unavailable',
            label: 'Scenario: operating_floor',
            sourcePath: 'source.options[1].risk.checks[2].status',
          },
        },
      };
      const refs = Object.entries(evidence.facts).filter(([, f]) =>
        /\.risk\.checks\[\d+\]\.status$/.test(f.sourcePath),
      );
      expect(refs.length).toBeGreaterThan(0);
      for (const [ref, fact] of refs) {
        const raw = {
          task: 'result_explain',
          payload: {
            claims: [{ kind: fact.value === 'unavailable' ? 'unavailable' : 'reported', ref }],
          },
        };
        expect(() => assertRiskSelection('stress_comparison', raw, evidence)).not.toThrow();
        const out = validateAiOutput(
          'result_explain',
          materializeClaims('result_explain', raw, evidence, locale),
          evidence,
          '',
          locale,
        );
        expect(JSON.stringify(out)).toContain(
          explanationText[locale][
            fact.value === 'unavailable' ? 'missing' : (fact.value as 'met' | 'breached')
          ],
        );
      }
      expect(() =>
        assertRiskSelection(
          'stress_comparison',
          { payload: { claims: [{ ref: 'f3' }] } },
          evidence,
        ),
      ).toThrow('AI_RISK_EVIDENCE_REQUIRED');
      expect(() =>
        assertRiskSelection(
          'stress_comparison',
          { payload: { claims: [{ ref: 'invented' }] } },
          evidence,
        ),
      ).toThrow();
    });
  }
});
