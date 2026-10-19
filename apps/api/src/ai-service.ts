import { materializeClaims, GroundingError } from '../../../packages/ai/src/grounding.js';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  AI_SCHEMA_VERSION,
  AI_PROMPT_VERSION,
  type AiRequest,
  type AiTask,
  providerSchema,
} from '../../../packages/ai/src/model.js';
import { validateAiOutput, AiValidationError } from '../../../packages/ai/src/validation.js';
import { reviewDocument } from '../../../packages/ai/src/proposal.js';
import { transaction, audit } from './db.js';
import { authorize, workspaceAccess } from './policy.js';
import type { PlanningContext } from './planning-service.js';
import { loadAiContext, aiInstruction, hashAiContext } from './ai-context.js';
import { AI_MODEL, AiProviderError, type AiProvider } from './ai-provider.js';
import { AppError } from './errors.js';

export function assertRiskSelection(
  kind: string,
  raw: unknown,
  evidence: import('../../../packages/ai/src/validation.js').AiEvidence,
) {
  if (kind === 'stress_comparison') {
    const claims = (raw as { payload?: { claims?: { ref: string }[] } })?.payload?.claims;
    if (
      !Array.isArray(claims) ||
      !claims.length ||
      claims.some(
        (claim) =>
          !/\.risk\.checks\[\d+\]\.status$/.test(evidence.facts[claim.ref]?.sourcePath ?? ''),
      )
    )
      throw new GroundingError('AI_RISK_EVIDENCE_REQUIRED');
  }
}

export const supportedAiTasks = ['assumption_review', 'result_explain', 'brief_narrative'] as const;
export function assertAiGenerationAllowed(task: AiTask) {
  if (task === 'scenario_extract') throw new AppError(410, 'AI_EXTRACTION_RETIRED');
}

export async function authorizeAi(c: PlanningContext, task: AiTask, kind: string) {
  const a = await workspaceAccess(c.db, c.workspaceId, c.actorId);
  authorize(a, 'ai.use');
  authorize(a, 'data.view');
  if (task === 'scenario_extract') authorize(a, 'scenario.edit');
  if (task === 'assumption_review')
    authorize(a, kind === 'scenario_draft' ? 'scenario.edit' : 'baseline.edit');
  if (task === 'result_explain') authorize(a, 'comparison.view');
  if (task === 'brief_narrative') authorize(a, 'brief.prepare');
}
export async function readAiArtifact(c: PlanningContext, id: string) {
  const row = (
    await c.db.query(
      'SELECT a.*,r.task,r.locale,r.source_ref,r.source_hash,r.depth FROM ai_artifacts a JOIN ai_requests r ON r.workspace_id=a.workspace_id AND r.id=a.request_id WHERE a.workspace_id=$1 AND a.id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND');
  await authorizeAi(c, row.task, row.source_ref.kind);
  try {
    validateAiOutput(
      row.task,
      row.output,
      row.evidence,
      [
        row.input_chain.text ?? '',
        ...row.input_chain.answers.map((a: { text: string }) => a.text),
      ].join('\n'),
      row.locale,
    );
  } catch {
    throw new AppError(422, 'AI_UNGROUNDED_PROSE');
  }
  return row;
}
export async function resolveAiInput(c: PlanningContext, input: AiRequest) {
  let depth = 0;
  let priorContext = '';
  let effectiveInput = input;
  if (input.priorArtifactId) {
    const previous = await readAiArtifact(c, input.priorArtifactId);
    if (
      previous.task !== input.task ||
      hashAiContext(previous.source_ref) !== hashAiContext(input.source)
    )
      throw new AppError(409, 'AI_SOURCE_CHANGED');
    depth = previous.depth + 1;
    if (depth > 3) throw new AppError(422, 'AI_CLARIFICATION_LIMIT');
    const questionIds = new Set((previous.output.questions as { id: string }[]).map((q) => q.id));
    if (input.answers.some((a) => !questionIds.has(a.questionId)))
      throw new AppError(422, 'AI_UNKNOWN_QUESTION');
    priorContext = JSON.stringify({ priorQuestions: previous.output.questions });
    const prior = previous.input_chain as {
      text: string | null;
      answers: { questionId: string; text: string }[];
    };
    if (input.text !== null && prior.text !== null && input.text !== prior.text)
      throw new AppError(409, 'AI_INPUT_CHANGED');
    // Question IDs may be reused by the provider in later rounds; retain every answer.
    const answers = [...prior.answers, ...input.answers];
    effectiveInput = {
      ...input,
      text: input.text ?? prior.text,
      answers,
    };
  }
  return { depth, priorContext, effectiveInput };
}
export function createAiService(pool: Pool, provider: AiProvider) {
  const active = new Set<string>();
  const attempts = new Map<string, number[]>();
  return async (
    actorId: string,
    workspaceId: string,
    requestId: string,
    input: AiRequest,
    signal?: AbortSignal,
  ) => {
    assertAiGenerationAllowed(input.task);
    let acquired = false;
    const within = <T>(fn: (c: PlanningContext) => Promise<T>) =>
      transaction(pool, actorId, workspaceId, (db) => fn({ db, actorId, workspaceId, requestId }));
    const prepared = await within(async (c) => {
      await authorizeAi(c, input.task, input.source.kind);
      const old = (
        await c.db.query(
          'SELECT * FROM ai_requests WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3',
          [workspaceId, actorId, input.idempotencyKey],
        )
      ).rows[0];
      const requestHash = hashAiContext(input);
      if (old) {
        if (old.request_hash !== requestHash) throw new AppError(409, 'AI_IDEMPOTENCY_CONFLICT');
        if (old.status === 'succeeded') {
          const artifact = (
            await c.db.query(
              'SELECT id FROM ai_artifacts WHERE workspace_id=$1 AND request_id=$2',
              [workspaceId, old.id],
            )
          ).rows[0];
          return { existing: await readAiArtifact(c, artifact.id) };
        }
        if (old.status === 'pending' && Date.now() - new Date(old.created_at).getTime() < 60000)
          throw new AppError(409, 'AI_REQUEST_PENDING');
        throw new AppError(409, 'AI_RETRY_WITH_NEW_KEY');
      }
      const { depth, priorContext, effectiveInput } = await resolveAiInput(c, input);
      const context = await loadAiContext(c, effectiveInput);
      const serialized = context.serialized + priorContext;
      if (serialized.length > 12000) throw new AppError(422, 'AI_CONTEXT_TOO_LARGE');
      const key = actorId + ':' + workspaceId;
      const now = Date.now();
      for (const [actor, times] of attempts)
        if (times.every((t) => now - t >= 60000)) attempts.delete(actor);
      const recent = (attempts.get(actorId) ?? []).filter((t) => now - t < 60000);
      if (active.has(key) || active.size >= 2 || recent.length >= 3)
        throw new AppError(429, 'AI_RATE_LIMITED');
      active.add(key);
      acquired = true;
      attempts.set(actorId, [...recent, now]);
      const id = randomUUID();
      await c.db.query(
        "INSERT INTO ai_requests(id,workspace_id,actor_id,idempotency_key,request_hash,source_hash,source_ref,task,locale,depth,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')",
        [
          id,
          workspaceId,
          actorId,
          input.idempotencyKey,
          requestHash,
          context.hash,
          input.source,
          input.task,
          input.locale,
          depth,
        ],
      );
      await audit(c.db, workspaceId, actorId, 'ai.requested', id, requestId, { task: input.task });
      return { id, context: { ...context, serialized }, key, recent, effectiveInput };
    }).catch((error) => {
      if (acquired) active.delete(actorId + ':' + workspaceId);
      throw error;
    });
    if ('existing' in prepared) return prepared.existing;
    try {
      const raw = await provider({
        schema: providerSchema(
          input.task,
          Object.keys(prepared.context.evidence.facts),
          input.locale,
        ),
        instruction: aiInstruction(input),
        context: prepared.context.serialized,
        signal,
      });
      assertRiskSelection(input.source.kind, raw, prepared.context.evidence);
      const output = validateAiOutput(
        input.task,
        materializeClaims(input.task, raw, prepared.context.evidence, input.locale),
        prepared.context.evidence,
        [
          prepared.effectiveInput.text ?? '',
          ...prepared.effectiveInput.answers.map((a) => a.text),
        ].join('\n'),
        input.locale,
      );
      return await within(async (c) => {
        await authorizeAi(c, input.task, input.source.kind);
        const current = await loadAiContext(c, input);
        if (current.hash !== prepared.context.hash) throw new AppError(409, 'AI_SOURCE_CHANGED');
        const id = randomUUID();
        const proposal = reviewDocument(output, current.evidence, input.source.id, id, randomUUID);
        if (output.task === 'scenario_extract' && output.outcome === 'ready' && !proposal)
          throw new AppError(422, 'AI_OUTPUT_INVALID');
        await c.db.query(
          'INSERT INTO ai_artifacts(id,workspace_id,request_id,output,evidence,model,schema_version,prompt_version,proposal,input_chain) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            id,
            workspaceId,
            prepared.id,
            output,
            current.evidence,
            AI_MODEL,
            AI_SCHEMA_VERSION,
            AI_PROMPT_VERSION,
            proposal,
            { text: prepared.effectiveInput.text, answers: prepared.effectiveInput.answers },
          ],
        );
        await c.db.query(
          "UPDATE ai_requests SET status='succeeded',finished_at=now() WHERE workspace_id=$1 AND id=$2",
          [workspaceId, prepared.id],
        );
        await audit(c.db, workspaceId, actorId, 'ai.completed', id, requestId, {
          task: input.task,
          model: AI_MODEL,
        });
        return readAiArtifact(c, id);
      });
    } catch (error) {
      const storageFailure =
        error instanceof Error &&
        'severity' in error &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[0-9A-Z]{5}$/.test(error.code);
      const code =
        error instanceof AiProviderError
          ? error.code
          : error instanceof AiValidationError || error instanceof GroundingError
            ? error.code
            : error instanceof AppError
              ? error.code
              : storageFailure
                ? 'AI_STORAGE_UNAVAILABLE'
                : 'AI_OUTPUT_INVALID';
      try {
        await within(async (c) => {
          const a = await workspaceAccess(c.db, workspaceId, actorId);
          authorize(a, 'data.view');
          await c.db.query(
            "UPDATE ai_requests SET status='failed',error_code=$3,finished_at=now() WHERE workspace_id=$1 AND id=$2",
            [workspaceId, prepared.id, code],
          );
          await audit(c.db, workspaceId, actorId, 'ai.failed', prepared.id, requestId, {
            code,
            ...(storageFailure ? { stage: 'storage' } : {}),
            ...(error instanceof AiProviderError && error.diagnostic ? error.diagnostic : {}),
          });
        });
      } catch {
        /* Revocation prevents both output disclosure and further tenant writes. */
      }
      if (error instanceof AppError) throw error;
      throw new AppError(code === 'AI_RATE_LIMITED' ? 429 : 503, code);
    } finally {
      active.delete(prepared.key);
    }
  };
}
