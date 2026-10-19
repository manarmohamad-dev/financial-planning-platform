import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { aiRequestSchema, providerSchema, aiTasks } from '../packages/ai/src/model.js';
import {
  validateAiOutput,
  normalizeDigits,
  type AiEvidence,
} from '../packages/ai/src/validation.js';
import { reviewDocument } from '../packages/ai/src/proposal.js';
const evidence: AiEvidence = {
  facts: { f1: { value: '64000', label: 'Ending cash', sourcePath: 'result.cash' } },
  entries: { e1: randomUUID() },
  scopes: { company: { kind: 'company' } },
  currency: 'EGP',
};
const explanation = () => ({
  schemaVersion: 'm7-1',
  task: 'result_explain',
  outcome: 'ready',
  summary: 'Reviewed evidence',
  questions: [],
  warnings: [],
  payload: {
    sections: [{ heading: 'Cash', segments: [{ kind: 'fact_ref', text: null, factRef: 'f1' }] }],
    limitations: ['Assumptions require review.'],
  },
});
describe('M7 structured contracts and evidence validation', () => {
  it.each(aiTasks)('exports strict provider JSON schema for %s', (task) => {
    const schema = providerSchema(task);
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('payload');
  });
  it('rejects wrong source/task and absent draft revision', () => {
    expect(
      aiRequestSchema.safeParse({
        task: 'scenario_extract',
        locale: 'ar',
        source: { kind: 'scenario_run', id: randomUUID(), revision: null },
        text: 'تعيين موظف',
        priorArtifactId: null,
        answers: [],
        consentVersion: 'groq-minimal-context-1',
        idempotencyKey: randomUUID(),
      }).success,
    ).toBe(false);
  });
  it('keeps authoritative numeric values in evidence references', () => {
    expect(validateAiOutput('result_explain', explanation(), evidence, '').outcome).toBe('ready');
  });
  it.each(['Cash 64000', 'النقد ٦٤٠٠٠', 'النقد ۶۴۰۰۰'])(
    'rejects unreferenced numeric claim %s',
    (text) => {
      const v = explanation();
      v.summary = text;
      expect(() => validateAiOutput('result_explain', v, evidence, '')).toThrow(
        'AI_UNREFERENCED_NUMBER',
      );
    },
  );
  it('rejects unknown references and additional properties', () => {
    const v = explanation();
    v.payload.sections[0].segments[0].factRef = 'f_other';
    expect(() => validateAiOutput('result_explain', v, evidence, '')).toThrow(
      'AI_UNKNOWN_EVIDENCE',
    );
    expect(() =>
      validateAiOutput('result_explain', { ...explanation(), sql: 'DROP TABLE' }, evidence, ''),
    ).toThrow('AI_OUTPUT_INVALID');
  });
  it('normalizes digits without converting decimal strings to binary money', () =>
    expect(normalizeDigits('١٢.٥۰')).toBe('12.50'));
});

const change = () => ({
  alias: 'change_one',
  label: 'Reviewed change',
  decision: 'sales',
  scopeAlias: 'company',
  currency: 'EGP',
  dependencies: [],
  evidence: [{ quote: '100' }],
  primitive: {
    kind: 'adjust',
    targetAlias: 'e1',
    start: '2026-01',
    end: '2026-03',
    operation: 'set',
    value: '100',
    cashReplacement: null,
  },
});
const proposal = () => ({
  schemaVersion: 'm7-1',
  task: 'scenario_extract',
  outcome: 'ready',
  summary: 'Review proposal',
  questions: [],
  warnings: [],
  payload: {
    title: 'Proposal',
    decisionType: 'sales',
    changes: [change()],
    expansion: null,
    paybackRequested: false,
  },
});
const explicit = '100 0 1 10% 2026-01 2026-03';
describe('M7 reviewed scenario proposal boundaries', () => {
  it.each(['set', 'add', 'subtract', 'percentage_increase', 'percentage_decrease', 'remove'])(
    'preserves existing %s primitive',
    (operation) => {
      const raw = proposal();
      raw.payload.changes[0].primitive.operation = operation;
      if (operation.startsWith('percentage_')) raw.payload.changes[0].primitive.value = '0.1';
      const result = validateAiOutput('scenario_extract', raw, evidence, explicit);
      const doc = reviewDocument(result, evidence, randomUUID(), randomUUID(), randomUUID);
      expect(doc?.changes[0].primitive.kind).toBe('adjust');
      expect(doc?.changes[0].source.kind).toBe('assumption');
    },
  );
  it.each(['sales', 'hiring', 'spending', 'expansion', 'combined'])(
    'preserves %s decision family without computation',
    (type) => {
      const raw = proposal();
      raw.payload.decisionType = type;
      const result = validateAiOutput('scenario_extract', raw, evidence, explicit);
      expect(reviewDocument(result, evidence, randomUUID(), randomUUID(), randomUUID)?.type).toBe(
        type,
      );
    },
  );
  it('rejects invented amount even when the model quotes real text', () => {
    const raw = proposal();
    raw.payload.changes[0].primitive.value = '9999';
    expect(() => validateAiOutput('scenario_extract', raw, evidence, explicit)).toThrow(
      'AI_UNSUPPORTED_INPUT_VALUE',
    );
  });
  it('normalizes explicit percentages without accepting a computed financial result', () => {
    const raw = proposal();
    raw.payload.changes[0].primitive.value = '0.1';
    raw.payload.changes[0].primitive.operation = 'percentage_increase';
    expect(validateAiOutput('scenario_extract', raw, evidence, explicit).outcome).toBe('ready');
  });
  it('rejects percent magnitude in place of the required ratio', () => {
    const raw = proposal();
    raw.payload.changes[0].primitive.value = '10';
    raw.payload.changes[0].primitive.operation = 'percentage_increase';
    expect(() => validateAiOutput('scenario_extract', raw, evidence, explicit)).toThrow(
      'AI_PERCENTAGE_UNIT_MISMATCH',
    );
  });
  it('rejects invented period, scope and quote', () => {
    let raw = proposal();
    raw.payload.changes[0].primitive.start = '2027-01';
    expect(() => validateAiOutput('scenario_extract', raw, evidence, explicit)).toThrow(
      'AI_UNSUPPORTED_INPUT_VALUE',
    );
    raw = proposal();
    raw.payload.changes[0].scopeAlias = 'other';
    expect(() => validateAiOutput('scenario_extract', raw, evidence, explicit)).toThrow(
      'AI_UNKNOWN_SCOPE',
    );
    raw = proposal();
    raw.payload.changes[0].evidence[0].quote = 'made up';
    expect(() => validateAiOutput('scenario_extract', raw, evidence, explicit)).toThrow(
      'AI_FABRICATED_QUOTE',
    );
  });
  it('does not materialize incomplete output', () => {
    const raw = {
      ...proposal(),
      outcome: 'needs_clarification',
      questions: [{ id: 'salary', field: 'salary', question: 'Salary?', reason: 'Missing' }],
    };
    expect(
      reviewDocument(
        validateAiOutput('scenario_extract', raw, evidence, explicit),
        evidence,
        randomUUID(),
        randomUUID(),
        randomUUID,
      ),
    ).toBeNull();
  });
  it.each([
    { kind: 'fixed', amount: '100' },
    { kind: 'headcount', count: 1, monthlyCost: '100', onboardingCost: '0' },
    { kind: 'revenue_linked', baseComponent: 'revenue', rate: '0.1' },
  ])('supports entry driver $kind with server-assigned provenance', (driver) => {
    const raw = proposal();
    const base = change();
    const entryChange = {
      ...base,
      primitive: {
        kind: 'entry',
        entry: {
          componentKey: 'new_entry',
          category: 'payroll',
          effect: 'operating_expense',
          start: '2026-01',
          end: '2026-03',
          date: null,
          driver,
          cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 0, proportion: '1' }] },
          committed: false,
          openingObligation: false,
          settles: null,
        },
      },
    };
    const result = validateAiOutput(
      'scenario_extract',
      { ...raw, payload: { ...raw.payload, changes: [entryChange] } },
      evidence,
      explicit,
    );
    const doc = reviewDocument(result, evidence, randomUUID(), randomUUID(), randomUUID);
    expect(doc?.changes[0].primitive.kind).toBe('entry');
    if (doc?.changes[0].primitive.kind === 'entry')
      expect(doc.changes[0].primitive.entry.source).toBe('assumption');
  });
});

it('allows punctuation-only narrative segments in Arabic while rejecting English prose', () => {
  const raw = {
    ...explanation(),
    summary: 'شرح الأدلة',
    payload: {
      sections: [{ heading: 'النقد', segments: [{ kind: 'text', text: '.', factRef: null }] }],
      limitations: ['تحتاج الافتراضات للمراجعة'],
    },
  };
  expect(validateAiOutput('result_explain', raw, evidence, '', 'ar').outcome).toBe('ready');
  raw.payload.sections[0].segments[0].text = 'Cash is safe';
  expect(() => validateAiOutput('result_explain', raw, evidence, '', 'ar')).toThrow(
    'AI_LANGUAGE_MISMATCH',
  );
});

it('constrains provider fact references to the authorized context', () => {
  const schema = JSON.stringify(providerSchema('assumption_review', ['f_authorized']));
  expect(schema).toContain('"enum":["f_authorized"]');
});
