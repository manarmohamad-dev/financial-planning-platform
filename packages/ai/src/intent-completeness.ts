import type { AiOutput } from './model.js';

// Conservative lexical tripwire, not a substitute for review or a language model.
// Detects explicit EN/AR decision families; never invents inputs or repairs output.
const families = {
  sales: /\b(?:sales|revenue)\b|مبيعات|ايراد/iu,
  hiring: /\b(?:hire|hiring|employee|employees|payroll)\b|توظيف|تعيين|موظف|اعين/iu,
  spending: /\b(?:expense|expenses|spending|marketing|rent|software)\b|مصروف|نفقات|تسويق|ايجار/iu,
  expansion: /\bexpansion\b|\b(?:open|opening|new)\s+(?:a\s+)?branch\b|توسع|فتح\s+فرع|فرع\s+جديد/iu,
};
type Family = keyof typeof families;
function normalize(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا');
}
export function explicitIntentFamilies(text: string): Family[] {
  const value = normalize(text);
  return (Object.keys(families) as Family[]).filter((f) => families[f].test(value));
}
export function assertIntentCompleteness(output: AiOutput, text: string): void {
  if (output.task !== 'scenario_extract' || output.outcome !== 'ready') return;
  const required = explicitIntentFamilies(text);
  // Excluded/unknown branch revenue is not a sales action. It still requires an
  // explicit expansion contract, never an implicit zero revenue entry.
  const expansion = required.includes('expansion');
  const excludedRevenue =
    /excluded_unknown|(?:revenue[^.!?]{0,65}(?:unknown|excluded))|(?:ايراد[^.!؟]{0,65}(?:مجهول|مستبعد))/iu.test(
      normalize(text),
    );
  const actionSales =
    /(?:increase|decrease|set|add|reduce)[^.!?]{0,25}(?:sales|revenue)|(?:زود|زد|خفض|قلل|اضف)[^.!؟]{0,25}(?:مبيعات|ايراد)/iu.test(
      normalize(text),
    );
  const distinctSpending =
    /marketing|rent|software|تسويق|ايجار|برمجيات|(?:add|increase|reduce)[^.!?]{0,15}expense|(?:اضف|زود|خفض)[^.!؟]{0,15}مصروف/iu.test(
      normalize(text),
    );
  const needed = required.filter(
    (f) =>
      !(f === 'sales' && expansion && excludedRevenue && !actionSales) &&
      !(f === 'spending' && required.includes('hiring') && !distinctSpending),
  );
  const p = output.payload;
  // Two expenses of the same family must not collapse to a single represented
  // family. This deliberately rejects uncertain category coverage rather than
  // constructing the missing change. Existing-entry adjustments retain quotes.
  const categories = {
    marketing: /\bmarketing\b|تسويق/iu,
    rent: /\brent\b|ايجار/iu,
    software: /\bsoftware\b|برمجيات/iu,
  };
  for (const [category, pattern] of Object.entries(categories)) {
    if (!pattern.test(normalize(text))) continue;
    if (
      !p.changes.some((c) =>
        c.primitive.kind === 'entry'
          ? c.primitive.entry.category === category
          : c.evidence.some((e) => pattern.test(normalize(e.quote))),
      )
    )
      throw new Error('AI_INTENT_INCOMPLETE');
  }
  if (
    expansion &&
    (!p.expansion ||
      !p.expansion.revenueMode ||
      !['expansion', 'combined'].includes(p.decisionType ?? '') ||
      !p.changes.some((c) => c.decision === 'expansion'))
  )
    throw new Error('AI_INTENT_INCOMPLETE');
  if (expansion && excludedRevenue && p.expansion?.revenueMode !== 'excluded_unknown')
    throw new Error('AI_INTENT_INCOMPLETE');
  for (const f of needed) {
    const represented = p.changes.some(
      (c) =>
        c.decision === f ||
        (f === 'spending' &&
          expansion &&
          c.decision === 'expansion' &&
          c.primitive.kind === 'entry' &&
          c.primitive.entry.effect === 'operating_expense'),
    );
    if (!represented) throw new Error('AI_INTENT_INCOMPLETE');
  }
  if (
    needed.filter((f) => f !== 'spending' || !expansion).length > 1 &&
    p.decisionType !== 'combined'
  )
    throw new Error('AI_INTENT_INCOMPLETE');
}
