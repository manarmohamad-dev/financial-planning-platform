import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  scenarioDocumentSchema,
  SCENARIO_CONTRACT,
  SCENARIO_ENGINE,
  comparisonMetrics,
  type ScenarioDocument,
  type ScenarioSnapshot,
  type ScenarioResult,
} from '../../../packages/scenarios/src/model.js';
import {
  evaluateScenario,
  runScenario,
  ScenarioBlocked,
} from '../../../packages/scenarios/src/engine.js';
import { baselineSnapshot, getBaseline, type PlanningContext } from './planning-service.js';
import { audit } from './db.js';
import { AppError } from './errors.js';

export async function publishedSnapshot(c: PlanningContext, id: string) {
  const b = await getBaseline(c, id);
  if (!b.published_at)
    throw new AppError(
      409,
      'BASELINE_NOT_PUBLISHED',
      'Publish this baseline before creating a decision scenario.',
    );
  return baselineSnapshot(c, id);
}
export async function createScenario(c: PlanningContext, document: ScenarioDocument) {
  const b = await publishedSnapshot(c, document.baselineVersionId);
  if (document.currency !== b.document.currency) throw new AppError(422, 'CURRENCY_MISMATCH');
  const id = randomUUID();
  const contributors = Object.fromEntries(document.changes.map((x) => [x.id, c.actorId]));
  await c.db.query(
    'INSERT INTO scenario_drafts(id,workspace_id,baseline_version_id,document,contributors,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)',
    [id, c.workspaceId, document.baselineVersionId, document, contributors, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'scenario.created', id, c.requestId);
  return { id, revision: 1, document };
}
export async function getScenarioDraft(c: PlanningContext, id: string, lock = false) {
  const r = (
    await c.db.query(
      `SELECT * FROM scenario_drafts WHERE workspace_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return {
    id: r.id as string,
    revision: r.revision as number,
    document: scenarioDocumentSchema.parse(r.document),
    contributors: r.contributors as Record<string, string>,
    createdBy: r.created_by as string,
  };
}
export async function updateScenario(
  c: PlanningContext,
  id: string,
  revision: number,
  document: ScenarioDocument,
) {
  const old = await getScenarioDraft(c, id, true);
  if (old.revision !== revision) throw new AppError(409, 'VERSION_CONFLICT');
  const b = await publishedSnapshot(c, document.baselineVersionId);
  if (b.document.currency !== document.currency) throw new AppError(422, 'CURRENCY_MISMATCH');
  const contributors = Object.fromEntries(
    document.changes.map((x) => [
      x.id,
      isDeepStrictEqual(
        x,
        old.document.changes.find((y) => y.id === x.id),
      )
        ? (old.contributors[x.id] ?? c.actorId)
        : c.actorId,
    ]),
  );
  await c.db.query(
    'UPDATE scenario_drafts SET document=$1,baseline_version_id=$2,contributors=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE workspace_id=$5 AND id=$6',
    [document, document.baselineVersionId, contributors, c.actorId, c.workspaceId, id],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'scenario.draft_edited', id, c.requestId, {
    revision: revision + 1,
  });
  if (!isDeepStrictEqual(old.document, document))
    await audit(c.db, c.workspaceId, c.actorId, 'scenario.assumptions_changed', id, c.requestId, {
      revision: revision + 1,
    });
  return { id, revision: revision + 1, document };
}
export async function validateScenario(c: PlanningContext, document: ScenarioDocument) {
  return evaluateScenario(await publishedSnapshot(c, document.baselineVersionId), document);
}
export async function confirmScenario(c: PlanningContext, id: string, revision: number) {
  const draft = await getScenarioDraft(c, id, true);
  if (draft.revision !== revision) throw new AppError(409, 'VERSION_CONFLICT');
  const report = await validateScenario(c, draft.document);
  if (!report.executable) throw new ScenarioBlocked(report);
  const existing = (
    await c.db.query(
      'SELECT id FROM scenario_versions WHERE workspace_id=$1 AND draft_id=$2 AND draft_revision=$3',
      [c.workspaceId, id, revision],
    )
  ).rows[0];
  if (existing) return { id: existing.id as string, readiness: report };
  const versionId = randomUUID();
  await c.db.query(
    'INSERT INTO scenario_versions(id,workspace_id,draft_id,draft_revision,baseline_version_id,document,contributors,created_by,confirmed_by,contract_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      versionId,
      c.workspaceId,
      id,
      revision,
      draft.document.baselineVersionId,
      draft.document,
      draft.contributors,
      draft.createdBy,
      c.actorId,
      SCENARIO_CONTRACT,
    ],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'scenario.confirmed', versionId, c.requestId, {
    revision,
  });
  if (
    (
      await c.db.query(
        'SELECT 1 FROM scenario_versions WHERE workspace_id=$1 AND draft_id=$2 AND id<>$3 LIMIT 1',
        [c.workspaceId, id, versionId],
      )
    ).rowCount
  )
    await audit(c.db, c.workspaceId, c.actorId, 'scenario.versioned', versionId, c.requestId, {
      revision,
    });
  return { id: versionId, readiness: report };
}
export async function getScenarioVersion(c: PlanningContext, id: string) {
  const r = (
    await c.db.query('SELECT * FROM scenario_versions WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return {
    id: r.id as string,
    draftId: r.draft_id as string,
    revision: r.draft_revision as number,
    document: scenarioDocumentSchema.parse(r.document),
    suppliedBy: r.contributors as Record<string, string>,
    createdBy: r.created_by as string,
    confirmedBy: r.confirmed_by as string,
    confirmedAt: (r.confirmed_at as Date).toISOString(),
  };
}
export async function executeScenario(c: PlanningContext, versionId: string, key: string) {
  const existing = (
    await c.db.query(
      'SELECT id,scenario_version_id FROM scenario_runs WHERE workspace_id=$1 AND idempotency_key=$2',
      [c.workspaceId, key],
    )
  ).rows[0];
  if (existing) {
    if (existing.scenario_version_id !== versionId) throw new AppError(409, 'IDEMPOTENCY_CONFLICT');
    return { id: existing.id as string };
  }
  const v = await getScenarioVersion(c, versionId);
  const b = await publishedSnapshot(c, v.document.baselineVersionId);
  const snapshot: ScenarioSnapshot = {
    contractVersion: SCENARIO_CONTRACT,
    scenarioEngineVersion: SCENARIO_ENGINE,
    scenarioVersionId: v.id,
    confirmedBy: v.confirmedBy,
    confirmedAt: v.confirmedAt,
    createdBy: v.createdBy,
    actorId: c.actorId,
    capturedAt: new Date().toISOString(),
    suppliedBy: v.suppliedBy,
    document: v.document,
    baseline: b,
  };
  const result = runScenario(snapshot);
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO scenario_runs(id,workspace_id,scenario_version_id,baseline_version_id,idempotency_key,input_snapshot,result,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, c.workspaceId, versionId, b.baselineVersionId, key, snapshot, result, c.actorId],
  );
  for (const p of result.comparison.periods)
    for (const metric of comparisonMetrics) {
      const x = p.metrics[metric];
      await c.db.query(
        'INSERT INTO scenario_period_results(workspace_id,run_id,period,metric,baseline,scenario,difference) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [c.workspaceId, id, p.period, metric, x.baseline, x.scenario, x.difference],
      );
    }
  await audit(c.db, c.workspaceId, c.actorId, 'scenario.run_completed', id, c.requestId);
  return { id };
}
export async function readScenarioRun(c: PlanningContext, id: string) {
  const r = (
    await c.db.query(
      'SELECT id,input_snapshot,result FROM scenario_runs WHERE workspace_id=$1 AND id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return {
    id: r.id as string,
    snapshot: r.input_snapshot as ScenarioSnapshot,
    result: r.result as ScenarioResult,
  };
}
export async function replayScenario(c: PlanningContext, id: string) {
  const r = await readScenarioRun(c, id);
  return {
    matches: isDeepStrictEqual(runScenario(r.snapshot), r.result),
    scenarioEngineVersion: r.result.manifest.scenarioEngineVersion,
    financialEngineVersion: r.result.manifest.financialEngineVersion,
  };
}
export async function createComparison(c: PlanningContext, title: string, runIds: string[]) {
  if (new Set(runIds).size !== runIds.length)
    throw new AppError(422, 'DUPLICATE_RUN', 'Choose distinct scenario runs.');
  const runs: Awaited<ReturnType<typeof readScenarioRun>>[] = [];
  for (const id of runIds) runs.push(await readScenarioRun(c, id));
  const baseline = runs[0].result.manifest.baselineVersionId;
  if (
    runs.some(
      (r) =>
        r.result.manifest.baselineVersionId !== baseline ||
        r.result.manifest.financialEngineVersion !==
          runs[0].result.manifest.financialEngineVersion ||
        r.result.manifest.roundingPolicyVersion !== runs[0].result.manifest.roundingPolicyVersion,
    )
  )
    throw new AppError(
      422,
      'INCOMPATIBLE_COMPARISON',
      'Direct comparison requires the same baseline and financial calculation policy. Recalculate explicitly against a compatible baseline.',
    );
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO scenario_comparisons(id,workspace_id,baseline_version_id,title,created_by) VALUES($1,$2,$3,$4,$5)',
    [id, c.workspaceId, baseline, title, c.actorId],
  );
  for (const [ordinal, r] of runs.entries())
    await c.db.query(
      'INSERT INTO scenario_comparison_runs(workspace_id,comparison_id,baseline_version_id,run_id,ordinal) VALUES($1,$2,$3,$4,$5)',
      [c.workspaceId, id, baseline, r.id, ordinal],
    );
  await audit(c.db, c.workspaceId, c.actorId, 'scenario.comparison_created', id, c.requestId, {
    count: runs.length,
  });
  return { id };
}
export async function readComparison(c: PlanningContext, id: string) {
  const r = (
    await c.db.query(
      'SELECT id,title,baseline_version_id FROM scenario_comparisons WHERE workspace_id=$1 AND id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  const members = (
    await c.db.query(
      'SELECT run_id FROM scenario_comparison_runs WHERE workspace_id=$1 AND comparison_id=$2 ORDER BY ordinal',
      [c.workspaceId, id],
    )
  ).rows;
  const runs = [];
  for (const m of members) {
    const run = await readScenarioRun(c, m.run_id);
    runs.push({ id: run.id, title: run.snapshot.document.title, result: run.result });
  }
  return {
    id: r.id as string,
    title: r.title as string,
    baselineVersionId: r.baseline_version_id as string,
    runs,
  };
}
