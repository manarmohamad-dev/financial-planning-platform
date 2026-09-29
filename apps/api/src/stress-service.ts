import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { idSchema } from '../../../packages/contracts/src/index.js';
import {
  definitionSchema,
  STRESS_VERSION,
  type Source,
  type SourceRef,
  type Policy,
  type PolicyInput,
  type Definition,
  type StressOutcome,
  type Comparison,
  type Option,
} from '../../../packages/stress/src/model.js';
import {
  rules,
  stressInputs,
  runStress,
  evaluateRisk,
  assertCompatible,
  makeBrief,
  StressInvalid,
} from '../../../packages/stress/src/engine.js';
import { calculateBaseline } from '../../../packages/planning/src/engine.js';
import {
  readRun,
  baselineSnapshot,
  getBaseline,
  type PlanningContext,
} from './planning-service.js';
import { readScenarioRun } from './scenario-service.js';
import { audit } from './db.js';
import { AppError } from './errors.js';
export async function sourceRun(c: PlanningContext, ref: SourceRef): Promise<Source> {
  if (ref.kind === 'baseline') {
    const r = await readRun(c, ref.runId),
      b = await getBaseline(c, r.result.manifest.baselineVersionId);
    if (!b.published_at) throw new AppError(409, 'BASELINE_NOT_PUBLISHED');
    const snapshot = await baselineSnapshot(c, b.id);
    return {
      ref,
      title: snapshot.document.title,
      baselineVersionId: b.id,
      snapshot,
      financial: r.result,
      baseFinancial: r.result,
      context: { planningVersionId: snapshot.planningVersionId },
      payback: null,
    };
  }
  const r = await readScenarioRun(c, ref.runId);
  return {
    ref,
    title: r.snapshot.document.title,
    baselineVersionId: r.snapshot.baseline.baselineVersionId,
    snapshot: {
      ...r.snapshot.baseline,
      document: r.result.modifiedInputs,
      planningVersionId: r.snapshot.scenarioVersionId,
    },
    financial: r.result.scenario,
    baseFinancial: r.result.baseline,
    baselineSnapshot: r.snapshot.baseline,
    context: {
      scenarioVersionId: r.snapshot.scenarioVersionId,
      changes: r.result.changes,
      lineage: r.result.lineage,
    },
    payback: r.result.payback,
  };
}
export async function createPolicy(c: PlanningContext, input: PolicyInput) {
  const last = (
    await c.db.query(
      'SELECT revision FROM risk_policy_versions WHERE workspace_id=$1 ORDER BY revision DESC LIMIT 1',
      [c.workspaceId],
    )
  ).rows[0];
  if ((last?.revision ?? 0) !== input.expectedRevision) throw new AppError(409, 'VERSION_CONFLICT');
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO risk_policy_versions(id,workspace_id,revision,title,configuration,created_by) VALUES($1,$2,$3,$4,$5,$6)',
    [
      id,
      c.workspaceId,
      input.expectedRevision + 1,
      input.title,
      { currency: input.currency, rules: rules(input) },
      c.actorId,
    ],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'risk.policy_versioned', id, c.requestId);
  return getPolicy(c, id);
}
export async function getPolicy(c: PlanningContext, id: string): Promise<Policy> {
  const r = (
    await c.db.query('SELECT * FROM risk_policy_versions WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return {
    id: r.id,
    revision: r.revision,
    title: r.title,
    ...r.configuration,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  };
}
export async function getDefinition(
  c: PlanningContext,
  id: string,
): Promise<{
  id: string;
  revision: number;
  document: Definition;
  source: Source;
  createdBy: string;
  createdAt: string;
}> {
  const r = (
    await c.db.query('SELECT * FROM stress_definitions WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return {
    id: r.id,
    revision: r.revision,
    document: r.document,
    source: r.source_snapshot,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
  };
}
export async function createDefinition(
  c: PlanningContext,
  document: Definition,
  parentId: string | null,
) {
  const source = await sourceRun(c, document.source);
  const parent = parentId ? await getDefinition(c, parentId) : null;
  if (parent) {
    const existing = (
      await c.db.query(
        'SELECT id,document FROM stress_definitions WHERE workspace_id=$1 AND parent_id=$2',
        [c.workspaceId, parentId],
      )
    ).rows[0];
    if (existing) {
      if (isDeepStrictEqual(existing.document, document)) return getDefinition(c, existing.id);
      throw new AppError(409, 'VERSION_CONFLICT');
    }
  }
  const id = randomUUID();
  const prepared = stressInputs(source, document, id);
  calculateBaseline(prepared.snapshot);
  await c.db.query(
    'INSERT INTO stress_definitions(id,workspace_id,parent_id,revision,document,source_snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [id, c.workspaceId, parentId, (parent?.revision ?? 0) + 1, document, source, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'stress.definition_confirmed', id, c.requestId);
  return getDefinition(c, id);
}
export const batchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    definitionIds: z.array(idSchema).min(1).max(8),
    policyId: idSchema,
    idempotencyKey: z.string().min(1).max(100),
  })
  .strict();
export async function createBatch(c: PlanningContext, input: z.infer<typeof batchSchema>) {
  const prior = (
    await c.db.query(
      'SELECT id,request FROM stress_batches WHERE workspace_id=$1 AND idempotency_key=$2',
      [c.workspaceId, input.idempotencyKey],
    )
  ).rows[0];
  if (prior) {
    if (!isDeepStrictEqual(prior.request, input)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT');
    return getBatch(c, prior.id);
  }
  if (new Set(input.definitionIds).size !== input.definitionIds.length)
    throw new AppError(422, 'DUPLICATE_DEFINITION');
  const policy = await getPolicy(c, input.policyId);
  const definitions: Awaited<ReturnType<typeof getDefinition>>[] = [];
  for (const id of input.definitionIds) definitions.push(await getDefinition(c, id));
  if (
    definitions.some(
      (d) =>
        !isDeepStrictEqual(d.document.source, definitions[0].document.source) ||
        d.source.financial.currency !== policy.currency,
    )
  )
    throw new StressInvalid('One batch requires the same source run and matching policy currency.');
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO stress_batches(id,workspace_id,policy_id,title,idempotency_key,request,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [id, c.workspaceId, input.policyId, input.title, input.idempotencyKey, input, c.actorId],
  );
  for (const [i, d] of definitions.entries())
    await c.db.query(
      'INSERT INTO stress_children(id,workspace_id,batch_id,definition_id,ordinal) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), c.workspaceId, id, d.id, i],
    );
  await audit(c.db, c.workspaceId, c.actorId, 'stress.batch_created', id, c.requestId);
  return getBatch(c, id);
}
export function batchStatus(states: string[], cancelled: boolean) {
  if (cancelled) return 'cancelled';
  if (states.includes('running')) return 'running';
  if (states.includes('pending')) return 'pending';
  if (states.every((s) => s === 'succeeded')) return 'completed';
  if (states.includes('succeeded')) return 'partially_failed';
  return 'failed';
}
type Child = {
  id: string;
  definition_id: string;
  status: string;
  attempt: number;
  started_at: Date | null;
  error_code: string | null;
  result_id: string | null;
  document: Definition;
};
export async function getBatch(
  c: PlanningContext,
  id: string,
): Promise<{
  id: string;
  policy_id: string;
  title: string;
  status: string;
  cancelled_at: Date | null;
  children: Child[];
}> {
  const r = (
    await c.db.query(
      'SELECT b.*,x.cancelled_at FROM stress_batches b LEFT JOIN stress_cancellations x ON x.workspace_id=b.workspace_id AND x.batch_id=b.id WHERE b.workspace_id=$1 AND b.id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  const children = (
    await c.db.query(
      'SELECT c.*,r.id AS result_id,d.document FROM stress_children c JOIN stress_definitions d ON d.workspace_id=c.workspace_id AND d.id=c.definition_id LEFT JOIN stress_results r ON r.workspace_id=c.workspace_id AND r.child_id=c.id WHERE c.workspace_id=$1 AND c.batch_id=$2 ORDER BY ordinal',
      [c.workspaceId, id],
    )
  ).rows;
  return {
    ...r,
    status: batchStatus(
      children.map((c) => c.status),
      !!r.cancelled_at,
    ),
    children: children as Child[],
  };
}
export async function cancelBatch(c: PlanningContext, id: string) {
  await getBatch(c, id);
  await c.db.query(
    'INSERT INTO stress_cancellations(workspace_id,batch_id,cancelled_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [c.workspaceId, id, c.actorId],
  );
  await c.db.query(
    "UPDATE stress_children SET status='cancelled',error_code='CANCELLED' WHERE workspace_id=$1 AND batch_id=$2 AND status IN ('pending','failed')",
    [c.workspaceId, id],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'stress.batch_cancelled', id, c.requestId);
  return getBatch(c, id);
}
export async function getResult(c: PlanningContext, id: string) {
  const r = (
    await c.db.query('SELECT * FROM stress_results WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return { ...r, result: r.result as StressOutcome };
}
export async function claimChild(c: PlanningContext, batchId: string, childId: string) {
  const batch = await getBatch(c, batchId),
    child = batch.children.find((x) => x.id === childId);
  if (!child) throw new AppError(404, 'NOT_FOUND');
  if (batch.cancelled_at || ['succeeded', 'cancelled'].includes(child.status)) return null;
  if (child.status === 'running' && Date.now() - new Date(child.started_at ?? 0).getTime() < 30000)
    return null;
  if (child.status === 'running')
    await c.db.query(
      "INSERT INTO stress_attempts(workspace_id,child_id,attempt,outcome) VALUES($1,$2,$3,'INTERRUPTED') ON CONFLICT DO NOTHING",
      [c.workspaceId, childId, child.attempt],
    );
  if (child.attempt >= 3) {
    if (child.status === 'running')
      await c.db.query(
        "UPDATE stress_children SET status='failed',error_code='RETRY_LIMIT' WHERE workspace_id=$1 AND id=$2",
        [c.workspaceId, childId],
      );
    return null;
  }
  await c.db.query(
    "UPDATE stress_children SET status='running',attempt=attempt+1,started_at=now(),error_code=NULL WHERE workspace_id=$1 AND id=$2",
    [c.workspaceId, childId],
  );
  return {
    childId,
    batchId,
    attempt: child.attempt + 1,
    definition: await getDefinition(c, child.definition_id),
    policy: await getPolicy(c, batch.policy_id),
  };
}
export async function finishChild(
  c: PlanningContext,
  claim: NonNullable<Awaited<ReturnType<typeof claimChild>>>,
  outcome: { id: string; result: StressOutcome } | null,
  error: string | null,
) {
  const b = await getBatch(c, claim.batchId),
    child = b.children.find((x) => x.id === claim.childId)!;
  if (child.status !== 'running' || child.attempt !== claim.attempt)
    throw new AppError(409, 'ATTEMPT_SUPERSEDED');
  const cancelled = !!b.cancelled_at;
  if (!cancelled && !error && !outcome) throw new AppError(422, 'MISSING_STRESS_RESULT');
  const status = cancelled ? 'cancelled' : error ? 'failed' : 'succeeded';
  if (outcome && !error && !cancelled)
    await c.db.query(
      'INSERT INTO stress_results(id,workspace_id,child_id,definition_id,policy_id,result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        outcome.id,
        c.workspaceId,
        claim.childId,
        claim.definition.id,
        claim.policy.id,
        outcome.result,
        c.actorId,
      ],
    );
  await c.db.query(
    'INSERT INTO stress_attempts(workspace_id,child_id,attempt,outcome) VALUES($1,$2,$3,$4)',
    [c.workspaceId, claim.childId, claim.attempt, cancelled ? 'CANCELLED' : (error ?? 'succeeded')],
  );
  await c.db.query(
    'UPDATE stress_children SET status=$1,error_code=$2 WHERE workspace_id=$3 AND id=$4',
    [status, cancelled ? 'CANCELLED' : error, c.workspaceId, claim.childId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'stress.child_' + status, claim.childId, c.requestId);
}
export const comparisonSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    batchIds: z.array(idSchema).min(1).max(3),
    idempotencyKey: z.string().min(1).max(100),
  })
  .strict();
export async function createStressComparison(
  c: PlanningContext,
  input: z.infer<typeof comparisonSchema>,
) {
  const old = (
    await c.db.query(
      'SELECT id,request FROM stress_comparisons WHERE workspace_id=$1 AND idempotency_key=$2',
      [c.workspaceId, input.idempotencyKey],
    )
  ).rows[0];
  if (old) {
    if (!isDeepStrictEqual(old.request, input)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT');
    return readStressComparison(c, old.id);
  }
  if (new Set(input.batchIds).size !== input.batchIds.length)
    throw new StressInvalid('Choose distinct batches.');
  const batches: Awaited<ReturnType<typeof getBatch>>[] = [];
  for (const id of input.batchIds) batches.push(await getBatch(c, id));
  if (
    batches.some(
      (b) => b.policy_id !== batches[0].policy_id || ['pending', 'running'].includes(b.status),
    )
  )
    throw new StressInvalid('Compare settled batches with the same risk policy version.');
  const policy = await getPolicy(c, batches[0].policy_id),
    options: Option[] = [],
    failures: Comparison['failures'] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    const first = await getDefinition(c, batch.children[0].definition_id),
      source = first.source,
      key = `${source.ref.kind}/${source.ref.runId}`;
    if (!seen.has(key)) {
      seen.add(key);
      const ref = { kind: source.ref.kind, id: source.ref.runId };
      options.push({
        label: source.title,
        ref,
        source,
        financial: source.financial,
        risk: evaluateRisk(source.financial, policy, ref),
        definition: null,
      });
    }
    for (const child of batch.children) {
      if (child.status !== 'succeeded') {
        failures.push({
          childId: child.id,
          definitionId: child.definition_id,
          status: child.status,
          error: child.error_code,
        });
        continue;
      }
      const row = await getResult(c, child.result_id!),
        definition = await getDefinition(c, child.definition_id);
      options.push({
        label: definition.document.title,
        ref: { kind: 'stress', id: row.id },
        source: definition.source,
        financial: row.result.financial,
        risk: row.result.risk,
        definition: definition.document,
      });
    }
  }
  if (options[0]?.source.ref.kind === 'scenario') {
    const s = options[0].source,
      ref = { kind: 'scenario' as const, id: s.ref.runId, section: 'baseline' as const };
    options.unshift({
      label: 'Pinned baseline',
      ref,
      source: { ...s, snapshot: s.baselineSnapshot ?? s.snapshot, financial: s.baseFinancial },
      financial: s.baseFinancial,
      risk: evaluateRisk(s.baseFinancial, policy, ref),
      definition: null,
    });
  }
  assertCompatible(options, policy);
  const document: Comparison = {
    version: STRESS_VERSION,
    title: input.title,
    policy,
    baselineVersionId: options[0].source.baselineVersionId,
    options,
    failures,
    limitations: [
      'All options use the same pinned baseline, horizon and policy. No automatic ranking is performed.',
      'Constraint satisfaction applies only to the declared rules and modeled monthly periods.',
      'Failed or cancelled stress cases have no financial outcome; successful siblings remain available.',
    ],
  };
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO stress_comparisons(id,workspace_id,idempotency_key,request,document,created_by) VALUES($1,$2,$3,$4,$5,$6)',
    [id, c.workspaceId, input.idempotencyKey, input, document, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'stress.comparison_created', id, c.requestId);
  return { id, document };
}
export async function readStressComparison(c: PlanningContext, id: string) {
  const row = (
    await c.db.query('SELECT * FROM stress_comparisons WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND');
  return { id: row.id as string, document: row.document as Comparison };
}
export async function createBrief(c: PlanningContext, id: string) {
  const comparison = await readStressComparison(c, id);
  const old = (
    await c.db.query('SELECT id FROM decision_briefs WHERE workspace_id=$1 AND comparison_id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (old) return readBrief(c, old.id);
  const briefId = randomUUID(),
    document = makeBrief(comparison.document, id);
  await c.db.query(
    'INSERT INTO decision_briefs(id,workspace_id,comparison_id,document,created_by) VALUES($1,$2,$3,$4,$5)',
    [briefId, c.workspaceId, id, document, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'brief.prepared', briefId, c.requestId);
  return readBrief(c, briefId);
}
export async function readBrief(c: PlanningContext, id: string) {
  const row = (
    await c.db.query('SELECT * FROM decision_briefs WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND');
  return row;
}
export async function replayStress(c: PlanningContext, id: string) {
  const r = await getResult(c, id),
    d = await getDefinition(c, r.definition_id),
    p = await getPolicy(c, r.policy_id);
  return {
    matches: isDeepStrictEqual(
      r.result,
      runStress(d.source, d.document, d.id, id, p, { id: d.createdBy, at: d.createdAt }),
    ),
  };
}
export async function replayBrief(c: PlanningContext, id: string) {
  const b = await readBrief(c, id),
    comparison = await readStressComparison(c, b.comparison_id);
  return { matches: isDeepStrictEqual(b.document, makeBrief(comparison.document, comparison.id)) };
}
export { definitionSchema };
