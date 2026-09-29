import { validateForecastReferences } from './forecast-service.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Money, ROUNDING_POLICY } from '../../../packages/contracts/src/index.js';
import {
  planningDocumentSchema,
  PLANNING_CONTRACT,
  ENGINE_VERSION,
  type PlanningDocument,
  type PlanningEntry,
  type BaselineSnapshot,
  type BaselineResult,
  type Movement,
  type PeriodResult,
} from '../../../packages/planning/src/model.js';
import { calculateBaseline, evaluateCapabilities } from '../../../packages/planning/src/engine.js';
import { AppError } from './errors.js';
import { audit } from './db.js';
export type PlanningContext = {
  db: PoolClient;
  workspaceId: string;
  actorId: string;
  requestId: string;
};
export async function createFinancialDraft(c: PlanningContext, document: PlanningDocument) {
  const id = randomUUID();
  const contributors = Object.fromEntries(document.entries.map((e) => [e.id, c.actorId]));
  await c.db.query(
    'INSERT INTO financial_drafts(id,workspace_id,document,contributors,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)',
    [id, c.workspaceId, document, contributors, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'financial.draft_created', id, c.requestId);
  return { id, revision: 1, document };
}
export async function getFinancialDraft(c: PlanningContext, id: string, lock = false) {
  const row = (
    await c.db.query(
      `SELECT id,document,revision,contributors,created_by,updated_by FROM financial_drafts WHERE workspace_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND');
  return {
    id: row.id as string,
    document: planningDocumentSchema.parse(row.document),
    revision: row.revision as number,
    contributors: row.contributors as Record<string, string>,
    createdBy: row.created_by as string,
  };
}
export function rawEvidence(document: PlanningDocument): string {
  const normalized = planningDocumentSchema.parse(document);
  for (const e of normalized.entries) {
    if (e.driver.kind === 'fixed' && e.driver.amount !== null)
      e.driver.amount = Money.parse(e.driver.amount, document.currency).serialize();
    if (e.driver.kind === 'headcount') {
      if (e.driver.monthlyCost !== null)
        e.driver.monthlyCost = Money.parse(e.driver.monthlyCost, document.currency).serialize();
      if (e.driver.onboardingCost !== null)
        e.driver.onboardingCost = Money.parse(
          e.driver.onboardingCost,
          document.currency,
        ).serialize();
    }
  }
  if (normalized.openingCash) {
    for (const key of ['available', 'restricted'] as const) {
      const value = normalized.openingCash[key];
      if (value !== null)
        normalized.openingCash[key] = Money.parse(value, document.currency).serialize();
    }
  }
  document = normalized;
  return JSON.stringify({
    currency: document.currency,
    projectionStart: document.projectionStart,
    horizonMonths: document.horizonMonths,
    openingCash: document.openingCash?.source === 'observed' ? document.openingCash : null,
    entries: document.entries
      .filter((e) => e.source !== 'assumption')
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export async function readPlanningVersion(c: PlanningContext, id: string) {
  const row = (
    await c.db.query('SELECT * FROM planning_versions WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND');
  const records = (
    await c.db.query(
      'SELECT *,event_date::text AS event_date_text FROM planning_entries WHERE workspace_id=$1 AND planning_version_id=$2 ORDER BY ordinal',
      [c.workspaceId, id],
    )
  ).rows;
  const entries: PlanningEntry[] = records.map((r) => ({
    id: r.id,
    componentKey: r.component_key,
    label: r.label,
    category: r.category,
    effect: r.effect,
    currency: r.currency,
    scope: r.scope,
    source: r.source_kind,
    note: r.source_note,
    start: r.start_period,
    end: r.end_period,
    date: r.event_date
      ? `${r.start_period}-${String((r.event_date as Date).getDate()).padStart(2, '0')}`
      : null,
    driver:
      r.driver.kind === 'fixed'
        ? { kind: 'fixed', amount: r.amount }
        : r.driver.kind === 'headcount'
          ? { ...r.driver, monthlyCost: r.monthly_cost, onboardingCost: r.onboarding_cost }
          : r.driver,
    cashTreatment: r.timing,
    committed: r.committed,
    openingObligation: r.opening_obligation,
    settles: r.settles,
    ...(r.forecast_ref ? { forecastRef: r.forecast_ref } : {}),
  }));
  const document = planningDocumentSchema.parse({
    contractVersion: row.contract_version,
    title: row.title,
    currency: row.currency,
    projectionStart: row.projection_start,
    horizonMonths: row.horizon_months,
    requestedOutputs: row.requested_outputs,
    coverage: row.coverage,
    openingCash: row.opening_metadata
      ? {
          ...row.opening_metadata,
          available: row.opening_available,
          restricted: row.opening_restricted,
        }
      : null,
    entries,
  });
  return {
    id: row.id as string,
    document,
    confirmedBy: row.confirmed_by as string,
    confirmedAt: (row.confirmed_at as Date).toISOString(),
    suppliedBy: Object.fromEntries(records.map((r) => [r.id, r.supplied_by as string])),
  };
}
export async function confirmPlanning(c: PlanningContext, id: string, revision: number) {
  const draft = await getFinancialDraft(c, id, true);
  if (draft.revision !== revision) throw new AppError(409, 'VERSION_CONFLICT');
  await validateForecastReferences(c, draft.document);
  const report = evaluateCapabilities(draft.document);
  if (!report.executable)
    throw new AppError(
      422,
      'CAPABILITY_BLOCKED',
      'Resolve the requested capability requirements before confirming.',
      report,
    );
  const existing = (
    await c.db.query(
      'SELECT id FROM planning_versions WHERE workspace_id=$1 AND draft_id=$2 AND draft_revision=$3',
      [c.workspaceId, id, revision],
    )
  ).rows[0];
  if (existing) return { id: existing.id as string, capabilities: report };
  const versionId = randomUUID();
  const d = draft.document;
  const cash = d.openingCash;
  const metadata = cash ? { asOf: cash.asOf, source: cash.source, note: cash.note } : null;
  await c.db.query(
    'INSERT INTO planning_versions(id,workspace_id,draft_id,draft_revision,title,currency,projection_start,horizon_months,requested_outputs,coverage,opening_available,opening_restricted,opening_metadata,contract_version,confirmed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
    [
      versionId,
      c.workspaceId,
      id,
      revision,
      d.title,
      d.currency,
      d.projectionStart,
      d.horizonMonths,
      JSON.stringify(d.requestedOutputs),
      d.coverage,
      cash?.available ?? null,
      cash?.restricted ?? null,
      metadata,
      PLANNING_CONTRACT,
      c.actorId,
    ],
  );
  for (const [ordinal, e] of d.entries.entries()) {
    const driver =
      e.driver.kind === 'fixed'
        ? { kind: 'fixed' }
        : e.driver.kind === 'headcount'
          ? { kind: 'headcount', count: e.driver.count }
          : e.driver;
    await c.db.query(
      'INSERT INTO planning_entries(id,workspace_id,planning_version_id,ordinal,component_key,label,category,effect,currency,source_kind,source_note,scope,start_period,end_period,event_date,amount,monthly_cost,onboarding_cost,driver,timing,committed,opening_obligation,settles,supplied_by,confirmed_by,confirmed_at,forecast_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,now(),$26)',
      [
        e.id,
        c.workspaceId,
        versionId,
        ordinal,
        e.componentKey,
        e.label,
        e.category,
        e.effect,
        e.currency,
        e.source,
        e.note,
        e.scope,
        e.start,
        e.end,
        e.date,
        e.driver.kind === 'fixed' ? e.driver.amount : null,
        e.driver.kind === 'headcount' ? e.driver.monthlyCost : null,
        e.driver.kind === 'headcount' ? e.driver.onboardingCost : null,
        driver,
        e.cashTreatment,
        e.committed,
        e.openingObligation,
        e.settles,
        draft.contributors[e.id] ?? c.actorId,
        c.actorId,
        e.forecastRef ?? null,
      ],
    );
  }
  await audit(c.db, c.workspaceId, c.actorId, 'planning.confirmed', versionId, c.requestId, {
    revision,
  });
  if (d.entries.some((e) => e.source === 'schedule'))
    await audit(c.db, c.workspaceId, c.actorId, 'schedule.confirmed', versionId, c.requestId);
  if (d.entries.some((e) => e.source === 'assumption') || cash?.source === 'assumption')
    await audit(c.db, c.workspaceId, c.actorId, 'assumption.confirmed', versionId, c.requestId);
  return { id: versionId, capabilities: report };
}
export async function latestReserve(c: PlanningContext) {
  const r = (
    await c.db.query(
      'SELECT id,minimum_cash,note,revision FROM reserve_policy_versions WHERE workspace_id=$1 ORDER BY revision DESC LIMIT 1',
      [c.workspaceId],
    )
  ).rows[0];
  return r
    ? {
        id: r.id as string,
        minimum: r.minimum_cash as string | null,
        note: r.note as string,
        revision: r.revision as number,
      }
    : null;
}
export async function prepareBaseline(c: PlanningContext, versionId: string) {
  await readPlanningVersion(c, versionId);
  const policy = await latestReserve(c);
  const id = randomUUID();
  await c.db.query(
    'INSERT INTO baseline_versions(id,workspace_id,planning_version_id,reserve_policy_id,created_by) VALUES($1,$2,$3,$4,$5)',
    [id, c.workspaceId, versionId, policy?.id ?? null, c.actorId],
  );
  await audit(c.db, c.workspaceId, c.actorId, 'baseline.prepared', id, c.requestId);
  return { id, planningVersionId: versionId, reservePolicyId: policy?.id ?? null };
}
export async function getBaseline(c: PlanningContext, id: string) {
  const r = (
    await c.db.query(
      'SELECT b.*,p.published_at FROM baseline_versions b LEFT JOIN baseline_publications p ON p.workspace_id=b.workspace_id AND p.baseline_version_id=b.id WHERE b.workspace_id=$1 AND b.id=$2',
      [c.workspaceId, id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  return r;
}
export async function publishBaseline(c: PlanningContext, id: string) {
  await getBaseline(c, id);
  const r = await c.db.query(
    'INSERT INTO baseline_publications(workspace_id,baseline_version_id,published_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [c.workspaceId, id, c.actorId],
  );
  if (r.rowCount)
    await audit(c.db, c.workspaceId, c.actorId, 'baseline.published', id, c.requestId);
  return { id, published: true };
}
export async function baselineSnapshot(
  c: PlanningContext,
  id: string,
  actorId = c.actorId,
): Promise<BaselineSnapshot> {
  const b = await getBaseline(c, id);
  const v = await readPlanningVersion(c, b.planning_version_id);
  const p = b.reserve_policy_id
    ? (
        await c.db.query(
          'SELECT id,minimum_cash,note FROM reserve_policy_versions WHERE workspace_id=$1 AND id=$2',
          [c.workspaceId, b.reserve_policy_id],
        )
      ).rows[0]
    : null;
  return {
    contractVersion: PLANNING_CONTRACT,
    workspaceId: c.workspaceId,
    baselineVersionId: id,
    planningVersionId: v.id,
    actorId,
    confirmedBy: v.confirmedBy,
    suppliedBy: v.suppliedBy,
    confirmedAt: v.confirmedAt,
    document: v.document,
    reservePolicy: p ? { id: p.id, minimum: p.minimum_cash, note: p.note } : null,
    engineVersion: ENGINE_VERSION,
    roundingPolicyVersion: ROUNDING_POLICY,
  };
}
export async function executeBaseline(c: PlanningContext, id: string, idempotencyKey: string) {
  const existing = (
    await c.db.query(
      'SELECT id,baseline_version_id FROM baseline_runs WHERE workspace_id=$1 AND idempotency_key=$2',
      [c.workspaceId, idempotencyKey],
    )
  ).rows[0];
  if (existing) {
    if (existing.baseline_version_id !== id) throw new AppError(409, 'IDEMPOTENCY_CONFLICT');
    return { id: existing.id as string };
  }
  const snapshot = await baselineSnapshot(c, id);
  const result = calculateBaseline(snapshot);
  const runId = randomUUID();
  const { periods, evidence, tailMovements, ...summary } = result;
  await c.db.query(
    'INSERT INTO baseline_runs(id,workspace_id,baseline_version_id,idempotency_key,manifest,capabilities,summary,engine_version,rounding_policy,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      runId,
      c.workspaceId,
      id,
      idempotencyKey,
      result.manifest,
      result.capabilities,
      { ...summary, tailIds: tailMovements.map((m) => m.id) },
      ENGINE_VERSION,
      ROUNDING_POLICY,
      c.actorId,
    ],
  );
  for (const p of periods)
    await c.db.query(
      'INSERT INTO baseline_period_results(workspace_id,run_id,period,revenue,operating_expenses,operating_result,non_operating_expenses,opening_cash,cash_inflows,cash_outflows,net_cash_movement,closing_cash,restricted_cash,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [
        c.workspaceId,
        runId,
        p.period,
        p.revenue,
        p.operatingExpenses,
        p.operatingResult,
        p.nonOperatingExpenses,
        p.openingCash,
        p.cashInflows,
        p.cashOutflows,
        p.netCashMovement,
        p.closingCash,
        p.restrictedCash,
        p.evidence,
      ],
    );
  for (const m of evidence) {
    const { amount, ...details } = m;
    await c.db.query(
      'INSERT INTO baseline_movements(workspace_id,run_id,id,entry_id,period,effect,amount,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [c.workspaceId, runId, m.id, m.entryId, m.period, m.effect, amount, details],
    );
  }
  await audit(c.db, c.workspaceId, c.actorId, 'baseline.run_completed', runId, c.requestId);
  return { id: runId };
}
export async function readRun(
  c: PlanningContext,
  id: string,
): Promise<{ id: string; result: BaselineResult }> {
  const r = (
    await c.db.query('SELECT * FROM baseline_runs WHERE workspace_id=$1 AND id=$2', [
      c.workspaceId,
      id,
    ])
  ).rows[0];
  if (!r) throw new AppError(404, 'NOT_FOUND');
  const s = r.summary as Omit<BaselineResult, 'periods' | 'evidence' | 'tailMovements'> & {
    tailIds: string[];
  };
  const money = (v: string | null) => (v === null ? null : Money.parse(v, s.currency).quantize());
  const periods: PeriodResult[] = (
    await c.db.query(
      'SELECT * FROM baseline_period_results WHERE workspace_id=$1 AND run_id=$2 ORDER BY period',
      [c.workspaceId, id],
    )
  ).rows.map((p) => ({
    period: p.period,
    revenue: money(p.revenue),
    operatingExpenses: money(p.operating_expenses),
    operatingResult: money(p.operating_result),
    nonOperatingExpenses: money(p.non_operating_expenses),
    openingCash: money(p.opening_cash),
    cashInflows: money(p.cash_inflows),
    cashOutflows: money(p.cash_outflows),
    netCashMovement: money(p.net_cash_movement),
    closingCash: money(p.closing_cash),
    restrictedCash: money(p.restricted_cash),
    evidence: p.evidence,
  }));
  const evidence: Movement[] = (
    await c.db.query(
      'SELECT amount,evidence FROM baseline_movements WHERE workspace_id=$1 AND run_id=$2',
      [c.workspaceId, id],
    )
  ).rows.map((m) => ({ ...m.evidence, amount: money(m.amount) }));
  // Restore engine order from the stable ordinal embedded in every movement reference.
  evidence.sort((a, b) => Number(a.id.split(':').at(-1)) - Number(b.id.split(':').at(-1)));
  const { tailIds, ...summary } = s;
  return {
    id,
    result: {
      ...summary,
      periods,
      evidence,
      tailMovements: evidence.filter((m) => tailIds.includes(m.id)),
    },
  };
}
