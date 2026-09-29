import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { idSchema, type Permission } from '../../../packages/contracts/src/index.js';
import { scenarioDocumentSchema } from '../../../packages/scenarios/src/model.js';
import { ScenarioBlocked } from '../../../packages/scenarios/src/engine.js';
import { demoDecisions, syntheticScenario } from '../../../packages/scenarios/src/fixtures.js';
import { syntheticFixture } from '../../../packages/planning/src/fixtures.js';
import { transaction, audit } from './db.js';
import { authorize, workspaceAccess, type WorkspaceAccess } from './policy.js';
import { AppError } from './errors.js';
import { logger } from './logging.js';
import {
  createFinancialDraft,
  confirmPlanning,
  prepareBaseline,
  publishBaseline,
  executeBaseline,
  type PlanningContext,
} from './planning-service.js';
import {
  publishedSnapshot,
  createScenario,
  getScenarioDraft,
  updateScenario,
  validateScenario,
  confirmScenario,
  getScenarioVersion,
  executeScenario,
  readScenarioRun,
  replayScenario,
  createComparison,
  readComparison,
} from './scenario-service.js';

export function scenarioRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });
  async function within<T>(
    req: Request,
    res: Response,
    permission: Permission,
    fn: (c: PlanningContext, a: WorkspaceAccess) => Promise<T>,
    companyOnly = false,
  ) {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED');
    const actorId = req.user.id;
    const workspaceId = idSchema.parse(req.params['workspaceId']);
    try {
      return await transaction(pool, actorId, workspaceId, async (db) => {
        if (req.method !== 'GET')
          await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
        const a = await workspaceAccess(db, workspaceId, actorId);
        authorize(a, permission);
        if (companyOnly && a.kind !== 'company') throw new AppError(403, 'DEMO_SYNTHETIC_ONLY');
        return fn({ db, workspaceId, actorId, requestId: res.locals.requestId }, a);
      });
    } catch (error) {
      const e =
        error instanceof ScenarioBlocked
          ? new AppError(
              422,
              'SCENARIO_BLOCKED',
              'Resolve scenario readiness findings before confirmation or execution.',
              error.report,
            )
          : error instanceof Error &&
              ['MONEY_OVERFLOW', 'PRECISION_REQUIRES_QUANTIZATION'].includes(error.message)
            ? new AppError(
                422,
                'MONEY_RANGE',
                'Financial values exceed the supported decimal range.',
              )
            : error;
      // Rejections must survive the rolled-back mutation, without logging input values.
      if (req.method !== 'GET')
        try {
          await transaction(pool, actorId, workspaceId, async (db) => {
            const a = await workspaceAccess(db, workspaceId, actorId);
            if (!a.permissions.includes('data.view')) return;
            await audit(
              db,
              workspaceId,
              actorId,
              'scenario.request_rejected',
              randomUUID(),
              res.locals.requestId,
              {
                code:
                  e instanceof AppError
                    ? e.code
                    : e instanceof z.ZodError
                      ? 'VALIDATION_FAILED'
                      : 'INTERNAL_ERROR',
              },
            );
          });
        } catch {
          logger.warn(
            { requestId: res.locals.requestId, code: 'REJECTION_AUDIT_UNAVAILABLE' },
            'Scenario rejection audit unavailable',
          );
        }
      throw e;
    }
  }
  router.get('/baselines/:id/inputs', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        publishedSnapshot(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.get('/drafts', async (req, res) =>
    res.json({
      drafts: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              "SELECT id,revision,document->>'title' AS title,baseline_version_id FROM scenario_drafts WHERE workspace_id=$1 ORDER BY updated_at DESC",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.post('/drafts', async (req, res) =>
    res
      .status(201)
      .json(
        await within(
          req,
          res,
          'scenario.edit',
          (c) => createScenario(c, scenarioDocumentSchema.parse(req.body)),
          true,
        ),
      ),
  );
  router.get('/drafts/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        getScenarioDraft(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.patch('/drafts/:id', async (req, res) =>
    res.json(
      await within(
        req,
        res,
        'scenario.edit',
        (c) => {
          const input = z
            .object({ revision: z.number().int().positive(), document: scenarioDocumentSchema })
            .strict()
            .parse(req.body);
          return updateScenario(
            c,
            idSchema.parse(req.params['id']),
            input.revision,
            input.document,
          );
        },
        true,
      ),
    ),
  );
  router.post('/validate', async (req, res) =>
    res.json(
      await within(
        req,
        res,
        'scenario.edit',
        (c) => validateScenario(c, scenarioDocumentSchema.parse(req.body)),
        true,
      ),
    ),
  );
  router.get('/drafts/:id/readiness', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) =>
        validateScenario(c, (await getScenarioDraft(c, idSchema.parse(req.params['id']))).document),
      ),
    ),
  );
  router.post('/drafts/:id/confirm', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'scenario.edit',
        (c) => {
          const input = z
            .object({
              revision: z.number().int().positive(),
              assumptionsConfirmed: z.literal(true),
            })
            .strict()
            .parse(req.body);
          return confirmScenario(c, idSchema.parse(req.params['id']), input.revision);
        },
        true,
      ),
    ),
  );
  router.get('/versions', async (req, res) =>
    res.json({
      versions: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              "SELECT id,draft_id,draft_revision,document->>'title' AS title,baseline_version_id,confirmed_at FROM scenario_versions WHERE workspace_id=$1 ORDER BY confirmed_at DESC",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/versions/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        getScenarioVersion(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/versions/:id/runs', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'scenario.run',
        (c) =>
          executeScenario(
            c,
            idSchema.parse(req.params['id']),
            z
              .object({ idempotencyKey: z.string().min(1).max(100) })
              .strict()
              .parse(req.body).idempotencyKey,
          ),
        true,
      ),
    ),
  );
  router.get('/runs', async (req, res) =>
    res.json({
      runs: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              "SELECT r.id,r.baseline_version_id,r.scenario_version_id,r.created_at,v.document->>'title' AS title FROM scenario_runs r JOIN scenario_versions v ON v.workspace_id=r.workspace_id AND v.id=r.scenario_version_id WHERE r.workspace_id=$1 ORDER BY r.created_at DESC LIMIT 100",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/runs/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) => {
        const r = await readScenarioRun(c, idSchema.parse(req.params['id']));
        return { id: r.id, result: r.result };
      }),
    ),
  );
  router.get('/runs/:id/evidence', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) => {
        const r = await readScenarioRun(c, idSchema.parse(req.params['id']));
        return {
          snapshot: r.snapshot,
          lineage: r.result.lineage,
          movements: r.result.scenario.evidence,
          comparison: r.result.comparison,
        };
      }),
    ),
  );
  router.post('/runs/:id/replay', async (req, res) =>
    res.json(
      await within(req, res, 'scenario.run', (c) =>
        replayScenario(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/comparisons', async (req, res) =>
    res.status(201).json(
      await within(req, res, 'comparison.view', (c) => {
        const input = z
          .object({
            title: z.string().trim().min(1).max(120),
            runIds: z.array(idSchema).min(1).max(3),
          })
          .strict()
          .parse(req.body);
        return createComparison(c, input.title, input.runIds);
      }),
    ),
  );
  router.get('/comparisons', async (req, res) =>
    res.json({
      comparisons: await within(
        req,
        res,
        'comparison.view',
        async (c) =>
          (
            await c.db.query(
              'SELECT id,title,baseline_version_id FROM scenario_comparisons WHERE workspace_id=$1 ORDER BY created_at DESC',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/comparisons/:id', async (req, res) =>
    res.json(
      await within(req, res, 'comparison.view', (c) =>
        readComparison(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/demo-examples', async (req, res) =>
    res.json(
      await within(req, res, 'scenario.run', async (c, a) => {
        if (a.kind !== 'demo') throw new AppError(403, 'DEMO_ONLY');
        const { type } = z
          .object({ type: z.enum(demoDecisions) })
          .strict()
          .parse(req.body);
        const key = `m3-demo:${type}`;
        const prior = (
          await c.db.query(
            'SELECT id FROM scenario_runs WHERE workspace_id=$1 AND idempotency_key=$2',
            [c.workspaceId, key],
          )
        ).rows[0];
        if (prior) return { id: prior.id as string };
        let baselineId = (
          await c.db.query(
            "SELECT baseline_version_id FROM baseline_runs WHERE workspace_id=$1 AND idempotency_key='synthetic:service'",
            [c.workspaceId],
          )
        ).rows[0]?.baseline_version_id as string | undefined;
        if (!baselineId) {
          const draft = await createFinancialDraft(c, syntheticFixture('service'));
          const version = await confirmPlanning(c, draft.id, 1);
          const baseline = await prepareBaseline(c, version.id);
          baselineId = baseline.id;
          await publishBaseline(c, baselineId);
          await executeBaseline(c, baselineId, 'synthetic:service');
        }
        const d = await createScenario(
          c,
          syntheticScenario(type, await publishedSnapshot(c, baselineId)),
        );
        const v = await confirmScenario(c, d.id, 1);
        return executeScenario(c, v.id, key);
      }),
    ),
  );
  return router;
}
