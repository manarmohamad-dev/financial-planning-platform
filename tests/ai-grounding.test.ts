import { materializeClaims } from '../packages/ai/src/grounding.js';
import { describe, it, expect } from 'vitest';
import { validateAiOutput } from '../packages/ai/src/validation.js';
import { providerSchema } from '../packages/ai/src/model.js';
import { createGroqProvider } from '../apps/api/src/ai-provider.js';
const evidence = {
  facts: { f1: { value: 'not_available', label: 'Funding gap', sourcePath: 'result.fundingGap' } },
  entries: {},
  scopes: {},
  currency: 'EGP',
};
const output = (text: string) => ({
  schemaVersion: 'm7-1',
  task: 'result_explain',
  outcome: 'ready',
  summary: 'Reviewed evidence',
  questions: [],
  warnings: [],
  payload: {
    sections: [
      {
        heading: 'Evidence',
        segments: [
          { kind: 'text', text, factRef: null },
          { kind: 'fact_ref', text: null, factRef: 'f1' },
        ],
      },
    ],
    limitations: ['This is not a recommendation.'],
  },
});
describe('M7 grounded presentation boundary', () => {
  it('preserves nullable closed vocabulary without nullable enum branches', () => {
    const schema = providerSchema('scenario_extract', [], 'en') as {
      properties: {payload: {properties: {title: unknown}}};
    };
    expect(schema.properties.payload.properties.title).toEqual({type:['string','null'],enum:['Proposal',null]});
  });
  it.each([
    'The analysis assumes no funding gap.',
    'The company can safely expand.',
    'Revenue will improve.',
    'There is no cash shortage.',
    'No additional investment is required.',
    'لا توجد فجوة تمويل.',
    'الشركة آمنة من الإفلاس.',
  ])('rejects unsupported qualitative claim %s', (text) => {
    expect(() => validateAiOutput('result_explain', output(text), evidence, '')).toThrow(
      'AI_UNGROUNDED_PROSE',
    );
  });
  it('preserves unavailable as evidence, never infers zero', () => {
    const v = validateAiOutput(
      'result_explain',
      materializeClaims('result_explain', {task:'result_explain',payload:{claims:[{kind:'unavailable',ref:'f1'}]}}, evidence, 'en'),
      evidence,
      '',
    );
    expect(v.outcome).toBe('ready');
    expect(evidence.facts.f1.value).toBe('not_available');
  });
  it('rejects claim hidden in summary or limitations', () => {
    const v = output('Evidence from the selected source.');
    v.summary = 'This business is profitable';
    expect(() => validateAiOutput('result_explain', v, evidence, '')).toThrow(
      'AI_UNGROUNDED_PROSE',
    );
    v.summary = 'Reviewed evidence';
    v.payload.limitations = ['The business requires no financing.'];
    expect(() => validateAiOutput('result_explain', v, evidence, '')).toThrow(
      'AI_UNGROUNDED_PROSE',
    );
  });
  it('provider explanation has no free prose channel', () => {
    const schema = providerSchema('brief_narrative', ['f1'], 'ar') as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.summary).toBeUndefined();
    expect(schema.properties.payload).toBeDefined();
  });
  it.each(['reported', 'assumption', 'schedule'])('cannot treat missing evidence as %s', (kind) => {
    expect(() =>
      materializeClaims(
        'result_explain',
        { task: 'result_explain', payload: { claims: [{ kind, ref: 'f1' }] } },
        evidence,
        'en',
      ),
    ).toThrow('AI_UNSUPPORTED_CLAIM');
  });
  it.each(['en', 'ar'] as const)('renders only exact source references in %s', (locale) => {
    const raw = materializeClaims(
      'result_explain',
      { task: 'result_explain', payload: { claims: [{ kind: 'unavailable', ref: 'f1' }] } },
      evidence,
      locale,
    );
    expect(validateAiOutput('result_explain', raw, evidence, '', locale).outcome).toBe('ready');
  });
  it('rejects model-injected prose on wire even with valid reference', () => {
    expect(() =>
      materializeClaims(
        'result_explain',
        {
          task: 'result_explain',
          payload: { claims: [{ kind: 'unavailable', ref: 'f1', text: 'No funding gap' }] },
        },
        evidence,
        'en',
      ),
    ).toThrow();
  });
});
describe('M7 sanitized failure diagnosis', () => {
  const input = { schema: {}, context: 'synthetic', instruction: 'synthetic' };
  it.each([400, 429, 503])('classifies HTTP %s without exposing body', async (status) => {
    const details: unknown[] = [];
    const provider = createGroqProvider({
      enabled: true,
      key: 'synthetic',
      transport: async () => new Response('private body', { status }),
      onDiagnostic: (d) => details.push(d),
    });
    await expect(provider(input)).rejects.toMatchObject({ diagnostic: { stage: 'http', status } });
    expect(JSON.stringify(details)).not.toContain('private');
  });
  it('distinguishes length truncation from malformed JSON', async () => {
    const provider = createGroqProvider({
      enabled: true,
      key: 'synthetic',
      transport: async () =>
        Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    });
    await expect(provider(input)).rejects.toMatchObject({
      diagnostic: { stage: 'finish', finish: 'length' },
    });
  });
});
