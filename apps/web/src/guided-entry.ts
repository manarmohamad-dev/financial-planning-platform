import type { ScenarioDocument } from '../../../packages/scenarios/src/model.js';

export const guidedDecisionTypes = ['sales', 'hiring', 'spending', 'expansion', 'combined'] as const;

/** Only choose a type for an untouched draft. Never reset saved or in-progress work. */
export function canStartGuidedEntry(document: ScenarioDocument, draftId: string, editorValues: string[]) {
  return !draftId && !document.title.trim() && document.changes.length === 0 &&
    document.expansion === null && !document.paybackRequested &&
    editorValues.every(value => value === '');
}
