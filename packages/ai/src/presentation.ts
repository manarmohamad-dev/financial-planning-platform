import type { AiEvidence } from './validation.js';
export const explanationText = {
  en: {
    missing:
      'This information is unavailable in the selected evidence. It is not zero and cannot support a conclusion about affordability or financing.',
    assumption:
      'This is an explicitly recorded planning assumption, not an observed fact. Review its supporting input and timing before using the decision.',
    observed:
      'This input is classified as observed in the saved source. That classification is not a guarantee of future performance.',
    schedule:
      'This input comes from a recorded schedule. Review its amount and timing; a schedule is not evidence that cash has already moved.',
    impact:
      'This source does not quantify the isolated effect of this input. A causal effect cannot be inferred from this review.',
    askAssumption: 'What evidence supports this assumption and its timing?',
    askMissing: 'Can you provide and review the missing input before relying on this metric?',
    cashNegative:
      'The saved period-end cash balance is negative. This identifies a projected cash shortfall in that period, not a calculated financing arrangement.',
    cash: 'This is the saved period-end cash balance after modeled receipts and payments. It is not profit or proof that every commitment is affordable.',
    minimum:
      'This is the lowest projected cash balance over the modeled horizon, not a required reserve threshold.',
    operating:
      'This is the saved operating result for the stated period. It is not ending cash or net profit.',
    decrease:
      'The engine reports a negative scenario-minus-baseline difference for this metric. The source values and the existing difference are shown together; this does not establish a cause or select a decision.',
    increase:
      'The engine reports a positive scenario-minus-baseline difference for this metric. The source values and the existing difference are shown together; this does not establish a cause or select a decision.',
    unchanged:
      'The engine reports no change for this metric between the baseline and scenario. This does not imply that other metrics are unchanged.',
    breached:
      'The saved risk check reports a policy breach. This is a comparison with the configured rule, not an estimated probability of failure.',
    met: 'The saved risk check meets its configured rule. Meeting this check does not mean that all risks are absent.',
    funding:
      'This is the funding-gap value reported by the saved engine result. It is not a financing offer or a recommendation to borrow.',
    input:
      'This is a recorded input or schedule field. It is not a calculated outcome or an independently verified assumption.',
    evidence:
      'This value is reproduced from the selected evidence. Its source does not support an additional financial conclusion.',
  },
  ar: {
    missing:
      'هذه المعلومة غير متاحة في الأدلة المحددة. لا تعني صفرًا ولا تسمح باستنتاج القدرة على تحمل القرار أو احتياجات التمويل.',
    assumption:
      'هذا افتراض تخطيطي مسجل صراحة، وليس واقعة مرصودة. راجع المدخل المرتبط به وتوقيته قبل الاعتماد على القرار.',
    observed:
      'هذا المدخل مصنف كبيان مرصود في المصدر المحفوظ. هذا التصنيف لا يضمن الأداء المستقبلي.',
    schedule:
      'هذا المدخل مستمد من جدول مسجل. راجع قيمته وتوقيته؛ وجود جدول لا يثبت أن النقد تحرك بالفعل.',
    impact:
      'هذا المصدر لا يحدد الأثر المنفرد لهذا المدخل. لا يمكن استنتاج علاقة سببية من هذه المراجعة.',
    askAssumption: 'ما الدليل الذي يدعم هذا الافتراض وتوقيته؟',
    askMissing: 'هل يمكنك توفير المدخل الناقص ومراجعته قبل الاعتماد على هذا المؤشر؟',
    cashNegative:
      'رصيد النقد المحفوظ في نهاية الفترة سالب. يشير ذلك إلى عجز نقدي متوقع في تلك الفترة، ولا يمثل ترتيب تمويل محسوبًا.',
    cash: 'هذا رصيد النقد المحفوظ في نهاية الفترة بعد المقبوضات والمدفوعات الممثلة في النموذج. ليس ربحًا أو دليلًا على القدرة على تحمل كل الالتزامات.',
    minimum: 'هذا أدنى رصيد نقدي متوقع خلال أفق النموذج، وليس حد الاحتياطي المطلوب.',
    operating: 'هذه نتيجة التشغيل المحفوظة للفترة الموضحة. ليست رصيد النقد الختامي أو صافي الربح.',
    decrease:
      'يسجل المحرك فرقًا سالبًا لهذا المؤشر بين السيناريو وخط الأساس. تظهر قيم المصدر والفرق المحسوب الموجود معًا؛ ولا يثبت ذلك سببًا أو يختار قرارًا.',
    increase:
      'يسجل المحرك فرقًا موجبًا لهذا المؤشر بين السيناريو وخط الأساس. تظهر قيم المصدر والفرق المحسوب الموجود معًا؛ ولا يثبت ذلك سببًا أو يختار قرارًا.',
    unchanged:
      'يسجل المحرك عدم تغير هذا المؤشر بين خط الأساس والسيناريو. لا يعني ذلك أن بقية المؤشرات لم تتغير.',
    breached:
      'يسجل فحص المخاطر المحفوظ تجاوزًا لقاعدة السياسة. هذه مقارنة بالقاعدة المحددة وليست احتمالًا محسوبًا للفشل.',
    met: 'يستوفي فحص المخاطر المحفوظ القاعدة المحددة له. استيفاء هذا الفحص لا يعني غياب جميع المخاطر.',
    funding:
      'هذه قيمة فجوة التمويل المسجلة في نتيجة المحرك المحفوظة. ليست عرض تمويل أو توصية بالاقتراض.',
    input:
      'هذه قيمة مدخل أو حقل جدول مسجل. ليست نتيجة محسوبة أو افتراضًا تم التحقق منه بصورة مستقلة.',
    evidence: 'هذه القيمة منقولة من الدليل المحدد. لا يدعم مصدرها استنتاجًا ماليًا إضافيًا.',
  },
} as const;
export type ExplanationKind = keyof typeof explanationText.en;
const numeric = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const zero = /^-?0(?:\.0+)?$/;
export function explanationKind(f: AiEvidence['facts'][string]): ExplanationKind {
  if (f.metricPath && /\.metrics\[\d+\]\.value$/.test(f.sourcePath))
    return explanationKind({ ...f, metricPath: undefined, sourcePath: 'saved.' + f.metricPath });
  if (['not_available', 'unavailable', 'unknown', 'not_supported'].includes(f.value))
    return 'missing';
  if (f.sourcePath.endsWith('.source') && ['assumption', 'observed', 'schedule'].includes(f.value))
    return f.value as 'assumption' | 'observed' | 'schedule';
  if (/\.comparison\..*\.difference$/.test(f.sourcePath) && numeric.test(f.value))
    return zero.test(f.value) ? 'unchanged' : f.value.startsWith('-') ? 'decrease' : 'increase';
  if (/\.risk\.checks\[\d+\]\.status$/.test(f.sourcePath) && ['met', 'breached'].includes(f.value))
    return f.value as 'met' | 'breached';
  if (/\.closingCash$/.test(f.sourcePath) && numeric.test(f.value))
    return f.value.startsWith('-') && !zero.test(f.value) ? 'cashNegative' : 'cash';
  if (/\.minimumCash\.amount$/.test(f.sourcePath)) return 'minimum';
  if (/\.operatingResult$/.test(f.sourcePath)) return 'operating';
  if (/\.fundingGap$/.test(f.sourcePath) && numeric.test(f.value)) return 'funding';
  if (/\.(entries|changes)\[/.test(f.sourcePath)) return 'input';
  return 'evidence';
}
export function relatedEvidence(ref: string, evidence: AiEvidence): string[] {
  const f = evidence.facts[ref];
  const kind = explanationKind(f);
  let prefix: string | undefined;
  if (['assumption', 'observed', 'schedule'].includes(kind))
    prefix = f.sourcePath.slice(0, -'.source'.length) + '.';
  if (['decrease', 'increase', 'unchanged'].includes(kind))
    prefix = f.sourcePath.slice(0, -'difference'.length);
  if (['met', 'breached'].includes(kind)) prefix = f.sourcePath.slice(0, -'status'.length);
  return [
    ref,
    ...Object.entries(evidence.facts)
      .filter(([id, v]) => id !== ref && prefix && v.sourcePath.startsWith(prefix))
      .map(([id]) => id),
  ].slice(0, 10);
}
export function evidencePresentation(ref: string, evidence: AiEvidence, locale: 'en' | 'ar') {
  const kind = explanationKind(evidence.facts[ref]);
  const t = explanationText[locale];
  return {
    kind,
    text: t[kind],
    refs: relatedEvidence(ref, evidence),
    question: kind === 'missing' ? t.askMissing : kind === 'assumption' ? t.askAssumption : null,
    limitation: ['assumption', 'observed', 'schedule', 'input'].includes(kind) ? t.impact : null,
  };
}
