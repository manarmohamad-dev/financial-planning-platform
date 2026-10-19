import {
  scenarioDocumentSchema,
  SCENARIO_CONTRACT,
  type ScenarioDocument,
} from '../../scenarios/src/model.js';
import type { AiOutput } from './model.js';
import type { AiEvidence } from './validation.js';

/** Materialize a REVIEW draft, never confirm or execute it. UUID generator is supplied by the server. */
export function reviewDocument(
  output: AiOutput,
  evidence: AiEvidence,
  baselineVersionId: string,
  artifactId: string,
  uuid: () => string,
): ScenarioDocument | null {
  if (output.task !== 'scenario_extract' || output.outcome !== 'ready') return null;
  const aliases = Object.fromEntries(
    output.payload.changes.map((change) => [change.alias, uuid()]),
  );
  const changes = output.payload.changes.map((change) => {
    const scope = change.scopeAlias ? evidence.scopes[change.scopeAlias] : undefined;
    const primitive = change.primitive;
    return {
      id: aliases[change.alias],
      label: change.label,
      decision: change.decision,
      scope,
      currency: change.currency,
      source: {
        kind: 'assumption',
        note: change.evidence
          .map((e) => e.quote)
          .join(' ')
          .slice(0, 500),
        reference: artifactId,
      },
      dependencies: change.dependencies.map((d) => aliases[d]),
      primitive:
        primitive.kind === 'adjust'
          ? {
              kind: 'adjust',
              targetEntryId: primitive.targetAlias ? evidence.entries[primitive.targetAlias] : null,
              start: primitive.start,
              end: primitive.end,
              operation: primitive.operation,
              value: primitive.value,
              cashReplacement: primitive.cashReplacement,
            }
          : {
              kind: 'entry',
              entry: {
                ...primitive.entry,
                id: uuid(),
                label: change.label,
                scope,
                currency: change.currency,
                source: 'assumption',
                note: change.evidence
                  .map((e) => e.quote)
                  .join(' ')
                  .slice(0, 500),
                settles: primitive.entry.settles
                  ? {
                      entryId: evidence.entries[primitive.entry.settles.entryAlias],
                      activityPeriod: primitive.entry.settles.activityPeriod,
                    }
                  : null,
              },
            },
    };
  });
  const parsed = scenarioDocumentSchema.safeParse({
    contractVersion: SCENARIO_CONTRACT,
    title: output.payload.title,
    baselineVersionId,
    currency: evidence.currency,
    type: output.payload.decisionType,
    changes,
    expansion: output.payload.expansion
      ? { ...output.payload.expansion, costsReviewed: false }
      : null,
    paybackRequested: output.payload.paybackRequested,
  });
  return parsed.success ? parsed.data : null;
}
