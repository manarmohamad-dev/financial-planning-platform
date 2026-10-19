import { describe, it, expect } from 'vitest';
import {
  aiOutputSchemas,
  decodeExtractionWire,
  extractionWireSchema,
} from '../packages/ai/src/model.js';
import {
  assertIntentCompleteness,
  explicitIntentFamilies,
} from '../packages/ai/src/intent-completeness.js';

const entry = {
  componentKey: 'rent',
  category: 'rent',
  effect: 'operating_expense',
  start: '2026-01',
  end: '2026-03',
  date: null,
  driver: { kind: 'fixed', amount: '3000' },
  cashTreatment: { kind: 'profile', buckets: [{ offsetMonths: 0, proportion: '1' }] },
  committed: false,
  openingObligation: false,
  settles: null,
};
const wire = () => ({
  schemaVersion: 'm7-1',
  wireVersion: 'extraction-slots-1',
  task: 'scenario_extract',
  outcome: 'ready',
  summary: 'Review proposal',
  questions: [],
  warnings: [],
  payload: {
    title: 'Proposal',
    decisionType: 'spending',
    paybackRequested: false,
    expansion: null,
    changes: [
      {
        alias: 'rent',
        label: 'Reviewed change',
        decision: 'spending',
        scopeAlias: 'company',
        currency: 'EGP',
        dependencies: [],
        evidence: [{ quote: 'rent' }],
        primitive: { adjust: null, entry },
      },
    ],
  },
});
describe('M7 extraction transport and completeness', () => {
  it.each(['Add rent and software expenses.', 'أضف إيجار ومصروف برمجيات.'])(
    'rejects a dropped same-family component: %s',
    (text) => {
      const v = aiOutputSchemas.scenario_extract.parse(decodeExtractionWire(wire()));
      expect(() => assertIntentCompleteness(v, text)).toThrow('AI_INTENT_INCOMPLETE');
    },
  );
  it('does not equate excluded expansion revenue with zero or silently omit expansion', () => {
    const v = aiOutputSchemas.scenario_extract.parse(decodeExtractionWire(wire()));
    v.payload.decisionType = 'expansion';
    v.payload.changes[0].decision = 'expansion';
    v.payload.expansion = { revenueMode: 'excluded_unknown', note: 'Assumptions require review.' };
    expect(() =>
      assertIntentCompleteness(v, 'Expansion scenario: add rent. Branch revenue excluded_unknown.'),
    ).not.toThrow();
    v.payload.expansion.revenueMode = 'modeled';
    expect(() =>
      assertIntentCompleteness(v, 'Expansion scenario: add rent. Branch revenue excluded_unknown.'),
    ).toThrow('AI_INTENT_INCOMPLETE');
  });
  it('decodes a single active slot into the unchanged strict public contract', () => {
    expect(extractionWireSchema.safeParse(wire()).success).toBe(true);
    expect(aiOutputSchemas.scenario_extract.safeParse(decodeExtractionWire(wire())).success).toBe(
      true,
    );
  });
  it('rejects both empty slots', () => {
    const v = wire();
    (v.payload.changes[0].primitive as unknown as { entry: null }).entry = null;
    expect(() => decodeExtractionWire(v)).toThrow('AI_PRIMITIVE_CONFLICT');
  });
  it('rejects both populated slots, not silently discarding an operation', () => {
    const v = wire();
    Object.assign(v.payload.changes[0].primitive, {
      adjust: {
        targetAlias: 'e1',
        start: '2026-01',
        end: '2026-03',
        operation: 'set',
        value: '3000',
        cashReplacement: null,
      },
    });
    expect(() => decodeExtractionWire(v)).toThrow('AI_PRIMITIVE_CONFLICT');
  });
  it('rejects wrong slot fields and unknown keys', () => {
    const v = wire();
    Object.assign(v.payload.changes[0].primitive, { operation: 'set' });
    expect(() => decodeExtractionWire(v)).toThrow();
  });
  it.each([
    'Expansion scenario: add rent; branch revenue excluded_unknown.',
    'هذا سيناريو توسع أضف إيجار؛ إيراد الفرع مستبعد لأنه مجهول.',
  ])('rejects the historically dropped expansion: %s', (text) => {
    const v = aiOutputSchemas.scenario_extract.parse(decodeExtractionWire(wire()));
    expect(() => assertIntentCompleteness(v, text)).toThrow('AI_INTENT_INCOMPLETE');
  });
  it.each([
    'Increase sales and hire employees and add marketing expense.',
    'زود المبيعات وعين موظف وأضف مصروف تسويق.',
  ])('rejects partial compound request: %s', (text) => {
    const v = aiOutputSchemas.scenario_extract.parse(decodeExtractionWire(wire()));
    expect(() => assertIntentCompleteness(v, text)).toThrow('AI_INTENT_INCOMPLETE');
  });
  it('never rejects a clarification as an executable partial proposal', () => {
    const v = aiOutputSchemas.scenario_extract.parse(decodeExtractionWire(wire()));
    v.outcome = 'needs_clarification';
    expect(() => assertIntentCompleteness(v, 'sales hiring expansion')).not.toThrow();
  });
  it('detects all four explicit families in Arabic and English', () => {
    for (const text of ['sales hiring expenses expansion', 'مبيعات توظيف مصروفات توسع'])
      expect(explicitIntentFamilies(text)).toEqual(['sales', 'hiring', 'spending', 'expansion']);
  });
});
