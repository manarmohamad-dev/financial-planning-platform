import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Money } from '../../../packages/contracts/src/index.js';
import {
  monthsFrom,
  monthDistance,
  type PlanningDocument,
} from '../../../packages/planning/src/model.js';
import { eligibility, compose } from '../../../packages/forecasting/src/engine.js';
import {
  historySchema,
  type ForecastRequest,
  type History,
  type Composition,
} from '../../../packages/forecasting/src/model.js';
import {
  readPlanningVersion,
  createFinancialDraft,
  confirmPlanning,
  prepareBaseline,
  type PlanningContext,
} from './planning-service.js';
import { AppError } from './errors.js';
import { audit } from './db.js';
export async function collectHistory(c: PlanningContext, input: ForecastRequest) {
  if (new Set(input.planningVersionIds).size !== input.planningVersionIds.length)
    throw new AppError(422, 'DUPLICATE_VERSION');
  const versions = [];
  for (const id of input.planningVersionIds) versions.push(await readPlanningVersion(c, id));
  const entries = versions.flatMap((v) =>
    v.document.entries.filter((e) => e.componentKey === input.componentKey).map((e) => ({ e, v })),
  );
  if (!entries.length) throw new AppError(404, 'NOT_FOUND');
  const first = entries[0].e;
  if (
    entries.some(
      ({ e }) =>
        e.currency !== first.currency ||
        e.category !== first.category ||
        e.effect !== first.effect ||
        e.driver.kind !== 'fixed' ||
        e.driver.amount === null ||
        e.scope.kind !== 'company',
    )
  )
    throw new AppError(
      422,
      'INVALID_SERIES',
      'Use one consistent company-wide fixed monthly Actual series.',
    );
  const observations = entries
    .flatMap(({ e, v }) =>
      monthsFrom(e.start, Math.min(133, monthDistance(e.start, e.end) + 1)).map((period) => ({
        period,
        value: e.driver.kind === 'fixed' ? e.driver.amount! : '0',
        planningVersionId: v.id,
        entryId: e.id,
        source: e.source,
        committed: e.committed,
        partial:
          (!v.document.coverage.revenueComplete && e.effect === 'revenue') ||
          (!v.document.coverage.expensesComplete && e.effect === 'operating_expense') ||
          /partial/i.test(e.note),
      })),
    )
    .sort((a, b) => a.period.localeCompare(b.period));
  const history: History = historySchema.parse({
    currency: first.currency,
    componentKey: first.componentKey,
    category: first.category,
    effect: first.effect,
    observations,
    sourceVersionIds: input.planningVersionIds,
    origin: input.origin,
    horizon: input.horizon,
    nature: input.nature,
    structuralChange: input.structuralChange,
  });
  return { history, eligibility: eligibility(history) };
}
export async function submit(c: PlanningContext, input: ForecastRequest) {
  const prior = (
    await c.db.query('SELECT * FROM forecast_jobs WHERE workspace_id=$1 AND idempotency_key=$2', [
      c.workspaceId,
      input.idempotencyKey,
    ])
  ).rows[0];
  if (prior) {
    if (!isDeepStrictEqual(prior.request, input)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT');
    return prior;
  }
  const evidence = await collectHistory(c, input);
  if (evidence.eligibility.status !== 'eligible')
    throw new AppError(
      422,
      'FORECAST_INELIGIBLE',
      evidence.eligibility.reason,
      evidence.eligibility,
    );
  const id = randomUUID();
  await c.db.query(
    "INSERT INTO forecast_jobs(id,workspace_id,actor_id,idempotency_key,request,history,eligibility,status) VALUES($1,$2,$3,$4,$5,$6,$7,'queued')",
    [
      id,
      c.workspaceId,
      c.actorId,
      input.idempotencyKey,
      input,
      evidence.history,
      evidence.eligibility,
    ],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'forecast.submitted', id, c.requestId);
  return getJob(c, id);
}
export async function getJob(c: PlanningContext, id: string) {
  const row = (
    await c.db.query(
      'SELECT j.*,a.id AS artifact_id FROM forecast_jobs j LEFT JOIN forecast_artifacts a ON a.workspace_id=j.workspace_id AND a.job_id=j.id WHERE j.workspace_id=$1 AND j.id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND');
  return row;
}
export async function getArtifact(c: PlanningContext, id: string) {
  const row = (
    await c.db.query(
      'SELECT a.*,p.id AS approval_id FROM forecast_artifacts a LEFT JOIN forecast_approvals p ON p.workspace_id=a.workspace_id AND p.artifact_id=a.id WHERE a.workspace_id=$1 AND a.id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND');
  return row;
}
export async function approve(c: PlanningContext, id: string) {
  const artifact = await getArtifact(c, id);
  if (artifact.result.status !== 'supported') throw new AppError(422, 'FORECAST_FALLBACK');
  if (artifact.approval_id) return { id: artifact.approval_id as string };
  const approval = randomUUID();
  await c.db.query(
    'INSERT INTO forecast_approvals(id,workspace_id,artifact_id,approved_by) VALUES($1,$2,$3,$4)',
    [approval, c.workspaceId, id, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'forecast.approved', id, c.requestId);
  return { id: approval };
}
/** Applied to every M2 confirmation too: a client cannot forge a Forecast badge. */
export async function validateForecastReferences(c: PlanningContext, d: PlanningDocument) {
  for (const e of d.entries) {
    if (e.source !== 'forecast') {
      if (e.forecastRef) throw new AppError(422, 'FORECAST_REFERENCE_CONFLICT');
      continue;
    }
    if (!e.forecastRef) continue; // Original M2 capability gate rejects unapproved source.
    const a = await getArtifact(c, e.forecastRef.artifactId);
    const point = (a.result.points as { period: string; value: string }[]).find(
      (p) => p.period === e.forecastRef!.period,
    );
    if (
      a.approval_id !== e.forecastRef.approvalId ||
      a.result.status !== 'supported' ||
      !point ||
      e.start !== point.period ||
      e.end !== point.period ||
      e.componentKey !== a.history.componentKey ||
      e.category !== a.history.category ||
      e.effect !== a.history.effect ||
      e.currency !== a.history.currency ||
      e.driver.kind !== 'fixed' ||
      e.driver.amount === null ||
      Money.parse(e.driver.amount, d.currency).serialize() !==
        Money.parse(point.value, d.currency).serialize()
    )
      throw new AppError(422, 'FORECAST_REFERENCE_CONFLICT');
  }
}
export async function composeBaseline(c: PlanningContext, input: Composition) {
  const prior = (
    await c.db.query(
      'SELECT * FROM forecast_compositions WHERE workspace_id=$1 AND idempotency_key=$2',
      [c.workspaceId, input.idempotencyKey],
    )
  ).rows[0];
  if (prior) {
    if (!isDeepStrictEqual(prior.request, input)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT');
    return prior;
  }
  const template = await readPlanningVersion(c, input.templateVersionId);
  const artifact = input.artifactId ? await getArtifact(c, input.artifactId) : null;
  if (artifact && artifact.approval_id !== input.approvalId)
    throw new AppError(422, 'FORECAST_APPROVAL_REQUIRED');
  let composed;
  try {
    composed = compose(template.document, input, artifact);
  } catch (e) {
    throw new AppError(
      422,
      'COMPOSITION_INVALID',
      e instanceof Error ? e.message : 'Invalid composition',
    );
  }
  const draft = await createFinancialDraft(c, composed.document),
    version = await confirmPlanning(c, draft.id, 1),
    baseline = await prepareBaseline(c, version.id),
    id = randomUUID();
  await c.db.query(
    'INSERT INTO forecast_compositions(id,workspace_id,idempotency_key,request,assignments,planning_version_id,baseline_version_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      c.workspaceId,
      input.idempotencyKey,
      input,
      JSON.stringify(composed.assignments),
      version.id,
      baseline.id,
      c.actorId,
    ],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'forecast.hybrid_created', id, c.requestId);
  return {
    id,
    planning_version_id: version.id,
    baseline_version_id: baseline.id,
    assignments: composed.assignments,
  };
}
