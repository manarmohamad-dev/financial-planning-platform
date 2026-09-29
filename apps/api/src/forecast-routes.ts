import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { idSchema } from '../../../packages/contracts/src/index.js';
import {
  FORECAST_VERSION,
  requestSchema,
  compositionSchema,
  runtimeResultSchema,
  type History,
  type Eligibility,
} from '../../../packages/forecasting/src/model.js';
import { transaction, audit } from './db.js';
import { workspaceAccess, authorize } from './policy.js';
import { AppError } from './errors.js';
import type { PlanningContext } from './planning-service.js';
import {
  collectHistory,
  submit,
  getJob,
  getArtifact,
  approve,
  composeBaseline,
} from './forecast-service.js';
import { runForecast, type ForecastRunner } from './forecast-runtime.js';
export function forecastRoutes(pool: Pool, runner: ForecastRunner = runForecast) {
  const router = Router({ mergeParams: true });
  async function within<T>(
    req: Request,
    res: Response,
    write: boolean,
    fn: (c: PlanningContext) => Promise<T>,
  ) {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED');
    const actor = req.user.id,
      wid = idSchema.parse(req.params['workspaceId']);
    return transaction(pool, actor, wid, async (db) => {
      if (write) await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [wid]);
      const access = await workspaceAccess(db, wid, actor);
      authorize(access, write ? 'baseline.edit' : 'data.view');
      if (write && access.kind !== 'company') throw new AppError(403, 'DEMO_SYNTHETIC_ONLY');
      return fn({ db, workspaceId: wid, actorId: actor, requestId: res.locals.requestId });
    });
  }
  router.post('/eligibility', async (req, res) =>
    res.json(
      await within(req, res, false, (c) => collectHistory(c, requestSchema.parse(req.body))),
    ),
  );
  router.post('/jobs', async (req, res) =>
    res
      .status(201)
      .json(await within(req, res, true, (c) => submit(c, requestSchema.parse(req.body)))),
  );
  router.get('/jobs', async (req, res) =>
    res.json({
      jobs: await within(
        req,
        res,
        false,
        async (c) =>
          (
            await c.db.query(
              'SELECT id,status,attempt,error_code,created_at FROM forecast_jobs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/jobs/:id', async (req, res) =>
    res.json(await within(req, res, false, (c) => getJob(c, idSchema.parse(req.params['id'])))),
  );
  router.post('/jobs/:id/run', async (req, res) => {
    const id = idSchema.parse(req.params['id']);
    z.object({}).strict().parse(req.body);
    const claim = await within(req, res, true, async (c) => {
      const j = await getJob(c, id);
      if (j.status === 'succeeded') return { done: true, job: j };
      if (j.status === 'running' && Date.now() - new Date(j.started_at).getTime() < 30000)
        throw new AppError(409, 'FORECAST_RUNNING');
      if (j.status === 'running')
        await c.db.query(
          "INSERT INTO forecast_attempts(workspace_id,job_id,attempt,outcome) VALUES($1,$2,$3,'FORECAST_INTERRUPTED') ON CONFLICT DO NOTHING",
          [c.workspaceId, id, j.attempt],
        );
      if (j.attempt >= 3) throw new AppError(409, 'FORECAST_RETRY_LIMIT');
      await c.db.query(
        "UPDATE forecast_jobs SET status='running',attempt=attempt+1,started_at=now(),error_code=NULL WHERE workspace_id=$1 AND id=$2",
        [c.workspaceId, id],
      );
      return { done: false, job: { ...j, attempt: j.attempt + 1 } };
    });
    if (claim.done) {
      res.json(claim.job);
      return;
    }
    const history = claim.job.history as History,
      evidence = claim.job.eligibility as Eligibility;
    let result: import('../../../packages/forecasting/src/model.js').RuntimeResult | undefined;
    let error: string | null = null;
    try {
      result = runtimeResultSchema.parse(
        await runner({
          version: FORECAST_VERSION,
          series: history.observations.map((p) => ({ period: p.period, value: p.value })),
          origin: history.origin,
          horizon: history.horizon as 3 | 6 | 12,
          folds: evidence.folds,
        }),
      );
    } catch (e) {
      const safe = [
        'FORECAST_TIMEOUT',
        'FORECAST_BUSY',
        'FORECAST_PROCESS_FAILED',
        'FORECAST_PROTOCOL_FAILED',
        'FORECAST_OUTPUT_LIMIT',
      ];
      error =
        e instanceof Error && safe.includes(e.message) ? e.message : 'FORECAST_PROCESS_FAILED';
    }
    const completed = await within(req, res, true, async (c) => {
      const current = await getJob(c, id);
      if (current.status !== 'running' || current.attempt !== claim.job.attempt)
        throw new AppError(409, 'FORECAST_ATTEMPT_SUPERSEDED');
      await c.db.query(
        'INSERT INTO forecast_attempts(workspace_id,job_id,attempt,outcome) VALUES($1,$2,$3,$4)',
        [c.workspaceId, id, current.attempt, error ?? 'succeeded'],
      );
      if (!error) {
        await c.db.query(
          'INSERT INTO forecast_artifacts(id,workspace_id,job_id,history,eligibility,result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [randomUUID(), c.workspaceId, id, history, evidence, result, c.actorId],
        );
      }
      await c.db.query(
        'UPDATE forecast_jobs SET status=$1,error_code=$2 WHERE workspace_id=$3 AND id=$4',
        [error ? 'failed' : 'succeeded', error, c.workspaceId, id],
      );
      await audit(
        c.db,
        c.workspaceId,
        c.actorId,
        error ? 'forecast.failed' : 'forecast.completed',
        id,
        c.requestId,
      );
      return getJob(c, id);
    });
    res.json(completed);
  });
  router.get('/artifacts/:id', async (req, res) =>
    res.json(
      await within(req, res, false, (c) => getArtifact(c, idSchema.parse(req.params['id']))),
    ),
  );
  router.post('/artifacts/:id/approve', async (req, res) =>
    res.json(
      await within(req, res, true, (c) => {
        z.object({ reviewed: z.literal(true) })
          .strict()
          .parse(req.body);
        return approve(c, idSchema.parse(req.params['id']));
      }),
    ),
  );
  router.post('/compositions', async (req, res) =>
    res
      .status(201)
      .json(
        await within(req, res, true, (c) => composeBaseline(c, compositionSchema.parse(req.body))),
      ),
  );
  router.get('/compositions/:id', async (req, res) =>
    res.json(
      await within(req, res, false, async (c) => {
        const row = (
          await c.db.query('SELECT * FROM forecast_compositions WHERE workspace_id=$1 AND id=$2', [
            c.workspaceId,
            idSchema.parse(req.params['id']),
          ])
        ).rows[0];
        if (!row) throw new AppError(404, 'NOT_FOUND');
        return row;
      }),
    ),
  );
  return router;
}
