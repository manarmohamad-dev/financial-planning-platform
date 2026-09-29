import { Router, type Request, type Response } from 'express';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { idSchema, type Permission } from '../../../packages/contracts/src/index.js';
import {
  planningDocumentSchema,
  nonnegativeMoney,
  type PlanningDocument,
} from '../../../packages/planning/src/model.js';
import {
  calculateBaseline,
  evaluateCapabilities,
  PlanningBlocked,
} from '../../../packages/planning/src/engine.js';
import { syntheticFixture, fixtureNames } from '../../../packages/planning/src/fixtures.js';
import { transaction, audit } from './db.js';
import { authorize, workspaceAccess, type WorkspaceAccess } from './policy.js';
import { AppError } from './errors.js';
import {
  createFinancialDraft,
  getFinancialDraft,
  rawEvidence,
  confirmPlanning,
  readPlanningVersion,
  latestReserve,
  prepareBaseline,
  getBaseline,
  publishBaseline,
  executeBaseline,
  readRun,
  type PlanningContext,
} from './planning-service.js';

export function planningRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });
  async function within<T>(
    req: Request,
    res: Response,
    permission: Permission,
    fn: (c: PlanningContext, a: WorkspaceAccess) => Promise<T>,
    companyOnly = false,
  ) {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED');
    const actor = req.user;
    const wid = idSchema.parse(req.params['workspaceId']);
    return transaction(pool, actor.id, wid, async (db) => {
      if (req.method !== 'GET')
        await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [wid]);
      const a = await workspaceAccess(db, wid, actor.id);
      authorize(a, permission);
      if (companyOnly && a.kind !== 'company') throw new AppError(403, 'DEMO_SYNTHETIC_ONLY');
      try {
        return await fn(
          { db, workspaceId: wid, actorId: actor.id, requestId: res.locals.requestId },
          a,
        );
      } catch (e) {
        if (e instanceof PlanningBlocked)
          throw new AppError(
            422,
            'CAPABILITY_BLOCKED',
            'The requested baseline is incomplete or conflicting.',
            e.report,
          );
        if (
          e instanceof Error &&
          ['MONEY_OVERFLOW', 'PRECISION_REQUIRES_QUANTIZATION'].includes(e.message)
        )
          throw new AppError(
            422,
            'MONEY_RANGE',
            'The requested monetary total is outside the supported range.',
          );
        throw e;
      }
    });
  }
  const checkCurrency = (d: PlanningDocument, a: WorkspaceAccess) => {
    if (d.currency !== a.currency)
      throw new AppError(
        422,
        'CURRENCY_MISMATCH',
        'Planning currency must match the workspace base currency.',
      );
  };
  router.get('/drafts', async (req, res) =>
    res.json({
      drafts: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              "SELECT id,document->>'title' AS title,revision,updated_at FROM financial_drafts WHERE workspace_id=$1 ORDER BY updated_at DESC",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.post('/drafts', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'data.edit',
        async (c, a) => {
          const d = planningDocumentSchema.parse(req.body);
          checkCurrency(d, a);
          return createFinancialDraft(c, d);
        },
        true,
      ),
    ),
  );
  router.get('/drafts/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        getFinancialDraft(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.patch('/drafts/:id', async (req, res) =>
    res.json(
      await within(
        req,
        res,
        'baseline.edit',
        async (c, a) => {
          const input = z
            .object({ revision: z.number().int().positive(), document: planningDocumentSchema })
            .strict()
            .parse(req.body);
          checkCurrency(input.document, a);
          const old = await getFinancialDraft(c, idSchema.parse(req.params['id']), true);
          if (old.revision !== input.revision) throw new AppError(409, 'VERSION_CONFLICT');
          if (rawEvidence(old.document) !== rawEvidence(input.document)) authorize(a, 'data.edit');
          const contributors = Object.fromEntries(
            input.document.entries.map((e) => [
              e.id,
              JSON.stringify(old.document.entries.find((x) => x.id === e.id)) === JSON.stringify(e)
                ? (old.contributors[e.id] ?? c.actorId)
                : c.actorId,
            ]),
          );
          await c.db.query(
            'UPDATE financial_drafts SET document=$1,contributors=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE workspace_id=$4 AND id=$5',
            [input.document, contributors, c.actorId, c.workspaceId, old.id],
          );
          await audit(
            c.db,
            c.workspaceId,
            c.actorId,
            'financial.draft_updated',
            old.id,
            c.requestId,
            { revision: input.revision + 1 },
          );
          return { id: old.id, revision: input.revision + 1, document: input.document };
        },
        true,
      ),
    ),
  );
  router.get('/drafts/:id/capabilities', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) =>
        evaluateCapabilities(
          (await getFinancialDraft(c, idSchema.parse(req.params['id']))).document,
        ),
      ),
    ),
  );
  router.post('/validate', async (req, res) =>
    res.json(
      await within(
        req,
        res,
        'baseline.edit',
        async (_c, a) => {
          const d = planningDocumentSchema.parse(req.body);
          checkCurrency(d, a);
          return evaluateCapabilities(d);
        },
        true,
      ),
    ),
  );
  router.post('/drafts/:id/confirm', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'baseline.edit',
        async (c, a) => {
          const { revision } = z
            .object({ revision: z.number().int().positive() })
            .strict()
            .parse(req.body);
          const id = idSchema.parse(req.params['id']);
          const draft = await getFinancialDraft(c, id, true);
          if (!a.permissions.includes('dataset.confirm')) {
            const last = (
              await c.db.query(
                'SELECT id FROM planning_versions WHERE workspace_id=$1 AND draft_id=$2 ORDER BY draft_revision DESC LIMIT 1',
                [c.workspaceId, id],
              )
            ).rows[0];
            if (
              !last ||
              rawEvidence((await readPlanningVersion(c, last.id)).document) !==
                rawEvidence(draft.document)
            )
              throw new AppError(
                403,
                'DATASET_CONFIRMATION_REQUIRED',
                'An Owner or Analyst must first confirm the raw financial information.',
              );
          }
          return confirmPlanning(c, id, revision);
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
              'SELECT id,title,confirmed_at FROM planning_versions WHERE workspace_id=$1 ORDER BY confirmed_at DESC',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/versions/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        readPlanningVersion(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.get('/versions/:id/capabilities', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) =>
        evaluateCapabilities(
          (await readPlanningVersion(c, idSchema.parse(req.params['id']))).document,
        ),
      ),
    ),
  );
  router.get('/reserve', async (req, res) =>
    res.json({ policy: await within(req, res, 'data.view', latestReserve) }),
  );
  router.post('/reserve', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'risk.edit',
        async (c) => {
          const input = z
            .object({
              minimum: nonnegativeMoney.nullable(),
              note: z.string().trim().min(1).max(500),
              expectedRevision: z.number().int().nonnegative(),
            })
            .strict()
            .parse(req.body);
          const old = await latestReserve(c);
          if ((old?.revision ?? 0) !== input.expectedRevision)
            throw new AppError(409, 'VERSION_CONFLICT');
          const id = randomUUID();
          await c.db.query(
            'INSERT INTO reserve_policy_versions(id,workspace_id,revision,minimum_cash,note,created_by) VALUES($1,$2,$3,$4,$5,$6)',
            [id, c.workspaceId, input.expectedRevision + 1, input.minimum, input.note, c.actorId],
          );
          await audit(c.db, c.workspaceId, c.actorId, 'risk_policy.changed', id, c.requestId, {
            revision: input.expectedRevision + 1,
          });
          return { id, revision: input.expectedRevision + 1 };
        },
        true,
      ),
    ),
  );
  router.post('/baselines', async (req, res) =>
    res
      .status(201)
      .json(
        await within(
          req,
          res,
          'baseline.edit',
          async (c) =>
            prepareBaseline(
              c,
              z.object({ planningVersionId: idSchema }).strict().parse(req.body).planningVersionId,
            ),
          true,
        ),
      ),
  );
  router.get('/baselines', async (req, res) =>
    res.json({
      baselines: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              'SELECT b.id,b.planning_version_id,b.created_at,v.title,p.published_at FROM baseline_versions b JOIN planning_versions v ON v.workspace_id=b.workspace_id AND v.id=b.planning_version_id LEFT JOIN baseline_publications p ON p.workspace_id=b.workspace_id AND p.baseline_version_id=b.id WHERE b.workspace_id=$1 ORDER BY b.created_at DESC',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/baselines/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) => getBaseline(c, idSchema.parse(req.params['id']))),
    ),
  );
  router.post('/baselines/:id/publish', async (req, res) =>
    res.json(
      await within(
        req,
        res,
        'baseline.publish',
        (c) => publishBaseline(c, idSchema.parse(req.params['id'])),
        true,
      ),
    ),
  );
  router.post('/baselines/:id/runs', async (req, res) =>
    res.status(201).json(
      await within(
        req,
        res,
        'baseline.edit',
        async (c) =>
          executeBaseline(
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
              'SELECT r.id,r.baseline_version_id,r.created_at,v.title FROM baseline_runs r JOIN baseline_versions b ON b.workspace_id=r.workspace_id AND b.id=r.baseline_version_id JOIN planning_versions v ON v.workspace_id=b.workspace_id AND v.id=b.planning_version_id WHERE r.workspace_id=$1 ORDER BY r.created_at DESC LIMIT 100',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/runs/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) => readRun(c, idSchema.parse(req.params['id']))),
    ),
  );
  router.get('/runs/:id/evidence', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) => {
        const { result } = await readRun(c, idSchema.parse(req.params['id']));
        return {
          manifest: result.manifest,
          openingCash: result.openingCashEvidence,
          movements: result.evidence,
        };
      }),
    ),
  );
  router.post('/runs/:id/replay', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) => {
        const { result } = await readRun(c, idSchema.parse(req.params['id']));
        const v = await readPlanningVersion(c, result.manifest.planningVersionId);
        const reproduced = calculateBaseline({ ...result.manifest, document: v.document });
        return {
          matches: isDeepStrictEqual(reproduced, result),
          engineVersion: reproduced.engineVersion,
        };
      }),
    ),
  );
  router.post('/demo-fixture', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c, a) => {
        if (a.kind !== 'demo') throw new AppError(403, 'DEMO_ONLY');
        const { profile } = z
          .object({ profile: z.enum(fixtureNames) })
          .strict()
          .parse(req.body);
        const key = `synthetic:${profile}`;
        const found = (
          await c.db.query(
            'SELECT id FROM baseline_runs WHERE workspace_id=$1 AND idempotency_key=$2',
            [c.workspaceId, key],
          )
        ).rows[0];
        if (found) return { id: found.id as string };
        const draft = await createFinancialDraft(c, syntheticFixture(profile));
        const version = await confirmPlanning(c, draft.id, 1);
        const baseline = await prepareBaseline(c, version.id);
        await publishBaseline(c, baseline.id);
        return executeBaseline(c, baseline.id, key);
      }),
    ),
  );
  return router;
}
