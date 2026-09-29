import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { idSchema, type Permission } from '../../../packages/contracts/src/index.js';
import { sourceSchema, policyInputSchema } from '../../../packages/stress/src/model.js';
import { runStress, StressInvalid } from '../../../packages/stress/src/engine.js';
import { ScenarioBlocked } from '../../../packages/scenarios/src/engine.js';
import { PlanningBlocked } from '../../../packages/planning/src/engine.js';
import { transaction } from './db.js';
import { workspaceAccess, authorize } from './policy.js';
import { AppError } from './errors.js';
import type { PlanningContext } from './planning-service.js';
import * as service from './stress-service.js';
export function stressRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });
  async function within<T>(
    req: Request,
    res: Response,
    permission: Permission,
    fn: (c: PlanningContext) => Promise<T>,
    write = false,
  ) {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED');
    const actor = req.user.id,
      wid = idSchema.parse(req.params['workspaceId']);
    return transaction(pool, actor, wid, async (db) => {
      if (write) await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [wid]);
      const access = await workspaceAccess(db, wid, actor);
      authorize(access, permission);
      if (write && access.kind !== 'company') throw new AppError(403, 'DEMO_SYNTHETIC_ONLY');
      try {
        return await fn({ db, workspaceId: wid, actorId: actor, requestId: res.locals.requestId });
      } catch (e) {
        if (e instanceof StressInvalid) throw new AppError(422, 'STRESS_INVALID', e.message);
        if (e instanceof ScenarioBlocked || e instanceof PlanningBlocked)
          throw new AppError(
            422,
            'STRESS_BLOCKED',
            'Resolve unsupported or conflicting stress inputs.',
            e.report,
          );
        throw e;
      }
    });
  }
  router.post('/source', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        service.sourceRun(c, sourceSchema.parse(req.body)),
      ),
    ),
  );
  router.get('/policies', async (req, res) =>
    res.json({
      policies: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              'SELECT id,revision,title,configuration,created_at FROM risk_policy_versions WHERE workspace_id=$1 ORDER BY revision DESC',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.post('/policies', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'risk.edit',
        async (c) => {
          const input = policyInputSchema.parse(req.body);
          const a = await workspaceAccess(c.db, c.workspaceId, c.actorId);
          if (input.currency !== a.currency) throw new AppError(422, 'CURRENCY_MISMATCH');
          return service.createPolicy(c, input);
        },
        true,
      ),
    ),
  );
  router.get('/policies/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        service.getPolicy(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.get('/definitions', async (req, res) =>
    res.json({
      definitions: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              "SELECT id,revision,document->>'title' AS title,document->'source' AS source,created_at FROM stress_definitions WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.post('/definitions', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'stress.run',
        (c) => {
          const input = z
            .object({ document: service.definitionSchema, parentId: idSchema.nullable() })
            .strict()
            .parse(req.body);
          return service.createDefinition(c, input.document, input.parentId);
        },
        true,
      ),
    ),
  );
  router.get('/definitions/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        service.getDefinition(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/batches', async (req, res) =>
    res
      .status(201)
      .json(
        await within(
          req,
          res,
          'stress.run',
          (c) => service.createBatch(c, service.batchSchema.parse(req.body)),
          true,
        ),
      ),
  );
  router.get('/batches', async (req, res) =>
    res.json({
      batches: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              'SELECT id,title,created_at FROM stress_batches WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/batches/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        service.getBatch(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/batches/:id/cancel', async (req, res) =>
    res.json(
      await within(
        req,
        res,
        'stress.run',
        (c) => service.cancelBatch(c, idSchema.parse(req.params['id'])),
        true,
      ),
    ),
  );
  router.post('/batches/:id/run', async (req, res) => {
    z.object({}).strict().parse(req.body);
    const id = idSchema.parse(req.params['id']);
    const batch = await within(req, res, 'stress.run', (c) => service.getBatch(c, id), true);
    for (const child of batch.children) {
      const claim = await within(
        req,
        res,
        'stress.run',
        (c) => service.claimChild(c, id, child.id),
        true,
      );
      if (!claim) continue;
      try {
        const resultId = randomUUID(),
          result = runStress(
            claim.definition.source,
            claim.definition.document,
            claim.definition.id,
            resultId,
            claim.policy,
            { id: claim.definition.createdBy, at: claim.definition.createdAt },
          );
        await within(
          req,
          res,
          'stress.run',
          (c) => service.finishChild(c, claim, { id: resultId, result }, null),
          true,
        );
      } catch (e) {
        if (e instanceof AppError && [401, 403, 404, 409].includes(e.status)) throw e;
        await within(
          req,
          res,
          'stress.run',
          (c) =>
            service.finishChild(
              c,
              claim,
              null,
              e instanceof StressInvalid ||
                e instanceof ScenarioBlocked ||
                e instanceof PlanningBlocked
                ? 'STRESS_INPUT_FAILED'
                : 'STRESS_EXECUTION_FAILED',
            ),
          true,
        );
      }
    }
    res.json(await within(req, res, 'data.view', (c) => service.getBatch(c, id)));
  });
  router.get('/results/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        service.getResult(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/results/:id/replay', async (req, res) =>
    res.json(
      await within(req, res, 'stress.run', (c) =>
        service.replayStress(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/comparisons', async (req, res) =>
    res
      .status(201)
      .json(
        await within(
          req,
          res,
          'comparison.view',
          (c) => service.createStressComparison(c, service.comparisonSchema.parse(req.body)),
          true,
        ),
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
              "SELECT id,document->>'title' AS title,created_at FROM stress_comparisons WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/comparisons/:id', async (req, res) =>
    res.json(
      await within(req, res, 'comparison.view', (c) =>
        service.readStressComparison(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/briefs', async (req, res) =>
    res
      .status(201)
      .json(
        await within(
          req,
          res,
          'brief.prepare',
          (c) =>
            service.createBrief(
              c,
              z.object({ comparisonId: idSchema }).strict().parse(req.body).comparisonId,
            ),
          true,
        ),
      ),
  );
  router.get('/briefs', async (req, res) =>
    res.json({
      briefs: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              "SELECT id,document->>'title' AS title,created_at FROM decision_briefs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/briefs/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        service.readBrief(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/briefs/:id/replay', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        service.replayBrief(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  return router;
}
