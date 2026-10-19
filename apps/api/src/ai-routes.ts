import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { aiRequestSchema, aiTasks, type AiRequest } from '../../../packages/ai/src/model.js';
import { scenarioDocumentSchema } from '../../../packages/scenarios/src/model.js';
import { transaction, audit } from './db.js';
import { workspaceAccess, authorize } from './policy.js';
import { AppError } from './errors.js';
import {
  createAiService,
  readAiArtifact,
  authorizeAi,
  resolveAiInput,
  assertAiGenerationAllowed,
  supportedAiTasks,
} from './ai-service.js';
import { type AiProvider } from './ai-provider.js';
import { createScenario } from './scenario-service.js';
import { loadAiContext, hashAiContext } from './ai-context.js';

export function aiRoutes(pool: Pool, provider: AiProvider, enabled: boolean) {
  const router = Router({ mergeParams: true });
  const generate = createAiService(pool, provider);
  router.use((req, _res, next) => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED');
    z.uuid().parse(req.params['workspaceId']);
    next();
  });
  router.get('/capabilities', async (req: Request, res: Response) => {
    const data = await transaction(
      pool,
      req.user!.id,
      String(req.params['workspaceId']),
      async (db) => {
        const a = await workspaceAccess(db, String(req.params['workspaceId']), req.user!.id);
        authorize(a, 'data.view');
        return {
          available: enabled && a.permissions.includes('ai.use') && a.status === 'active',
          tasks: supportedAiTasks,
          scenarioCreation: 'guided_input',
          freeTextExtraction: false,
          reason: enabled ? '' : 'AI_UNAVAILABLE',
        };
      },
    );
    res.json(data);
  });
  router.post('/requests', async (req: Request, res: Response) => {
    const actor = req.user!.id,
      workspace = String(req.params['workspaceId']);
    try {
      const input = aiRequestSchema.parse(req.body);
      assertAiGenerationAllowed(input.task);
      // Disabled AI remains explicit and never calls the provider.
      if (!enabled) throw new AppError(503, 'AI_UNAVAILABLE');
      const controller = new AbortController();
      const cancel = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on('close', cancel);
      try {
        res
          .status(201)
          .json(await generate(actor, workspace, res.locals.requestId, input, controller.signal));
      } finally {
        res.off('close', cancel);
      }
    } catch (error) {
      try {
        await transaction(pool, actor, workspace, async (db) => {
          const access = await workspaceAccess(db, workspace, actor);
          authorize(access, 'data.view');
          await audit(db, workspace, actor, 'ai.rejected', randomUUID(), res.locals.requestId, {
            code: error instanceof AppError ? error.code : 'VALIDATION_FAILED',
          });
        });
      } catch {
        /* No tenant writes for inaccessible workspaces. */
      }
      throw error;
    }
  });
  router.post('/context', async (req: Request, res: Response) => {
    const input = aiRequestSchema.parse(req.body);
    assertAiGenerationAllowed(input.task);
    res.json(
      await transaction(pool, req.user!.id, String(req.params['workspaceId']), async (db) => {
        const c = {
          db,
          workspaceId: String(req.params['workspaceId']),
          actorId: req.user!.id,
          requestId: res.locals.requestId,
        };
        await authorizeAi(c, input.task, input.source.kind);
        const { effectiveInput, priorContext } = await resolveAiInput(c, input);
        const context = await loadAiContext(c, effectiveInput);
        if (context.serialized.length + priorContext.length > 12000)
          throw new AppError(422, 'AI_CONTEXT_TOO_LARGE');
        return {
          context: {
            ...JSON.parse(context.serialized),
            ...(priorContext ? JSON.parse(priorContext) : {}),
          },
          sourceHash: context.hash,
        };
      }),
    );
  });
  router.get('/artifacts/:id', async (req: Request, res: Response) =>
    res.json(
      await transaction(pool, req.user!.id, String(req.params['workspaceId']), (db) =>
        readAiArtifact(
          {
            db,
            actorId: req.user!.id,
            workspaceId: String(req.params['workspaceId']),
            requestId: res.locals.requestId,
          },
          z.uuid().parse(req.params['id']),
        ),
      ),
    ),
  );
  router.get('/artifacts', async (req: Request, res: Response) => {
    const query = z
      .object({ sourceId: z.uuid(), task: z.enum(aiTasks) })
      .strict()
      .parse(req.query);
    res.json(
      await transaction(pool, req.user!.id, String(req.params['workspaceId']), async (db) => {
        const c = {
          db,
          actorId: req.user!.id,
          workspaceId: String(req.params['workspaceId']),
          requestId: res.locals.requestId,
        };
        // Individual artifact access is checked before returning any record metadata.
        const rows = (
          await db.query(
            "SELECT a.id FROM ai_artifacts a JOIN ai_requests r ON r.workspace_id=a.workspace_id AND r.id=a.request_id WHERE a.workspace_id=$1 AND r.source_ref->>'id'=$2 AND r.task=$3 ORDER BY a.created_at DESC LIMIT 20",
            [c.workspaceId, query.sourceId, query.task],
          )
        ).rows;
        const access = await workspaceAccess(db, c.workspaceId, c.actorId);
        authorize(access, 'ai.use');
        authorize(access, 'data.view');
        const items = [];
        for (const row of rows) {
          const a = await readAiArtifact(c, row.id);
          items.push({
            id: a.id,
            created_at: a.created_at,
            outcome: a.output.outcome,
            locale: a.locale,
          });
        }
        return { artifacts: items };
      }),
    );
  });
  router.get('/requests/:id', async (req: Request, res: Response) => {
    res.json(
      await transaction(pool, req.user!.id, String(req.params['workspaceId']), async (db) => {
        const row = (
          await db.query(
            'SELECT id,task,source_ref,status,error_code,created_at,finished_at FROM ai_requests WHERE workspace_id=$1 AND id=$2',
            [req.params['workspaceId'], z.uuid().parse(req.params['id'])],
          )
        ).rows[0];
        if (!row) throw new AppError(404, 'NOT_FOUND');
        await authorizeAi(
          {
            db,
            workspaceId: String(req.params['workspaceId']),
            actorId: req.user!.id,
            requestId: res.locals.requestId,
          },
          row.task,
          row.source_ref.kind,
        );
        return row;
      }),
    );
  });
  router.post('/artifacts/:id/apply', async (req: Request, res: Response) => {
    const input = z
      .object({ reviewed: z.literal(true), document: scenarioDocumentSchema })
      .strict()
      .parse(req.body);
    res.status(201).json(
      await transaction(pool, req.user!.id, String(req.params['workspaceId']), async (db) => {
        const c = {
          db,
          workspaceId: String(req.params['workspaceId']),
          actorId: req.user!.id,
          requestId: res.locals.requestId,
        };
        await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [c.workspaceId]);
        const artifact = await readAiArtifact(c, z.uuid().parse(req.params['id']));
        await authorizeAi(c, 'scenario_extract', 'published_baseline');
        if (artifact.task !== 'scenario_extract' || artifact.output.outcome !== 'ready')
          throw new AppError(422, 'AI_PROPOSAL_NOT_READY');
        if (input.document.baselineVersionId !== artifact.source_ref.id)
          throw new AppError(409, 'AI_SOURCE_CHANGED');
        const request: AiRequest = {
          task: 'scenario_extract',
          locale: artifact.locale,
          source: artifact.source_ref,
          text: 'reviewed',
          answers: [],
          priorArtifactId: null,
          consentVersion: 'groq-minimal-context-1',
          idempotencyKey: randomUUID(),
        };
        if ((await loadAiContext(c, request)).hash !== artifact.source_hash)
          throw new AppError(409, 'AI_SOURCE_CHANGED');
        // All AI-derived inputs remain assumptions, including manually reviewed edits.
        for (const change of input.document.changes) {
          change.source = { kind: 'assumption', note: change.source.note, reference: artifact.id };
          if (change.primitive.kind === 'entry') {
            change.primitive.entry.source = 'assumption';
            delete change.primitive.entry.forecastRef;
          }
        }
        const documentHash = hashAiContext(input.document);
        const old = (
          await db.query(
            'SELECT draft_id,document_hash FROM ai_applications WHERE workspace_id=$1 AND artifact_id=$2 AND actor_id=$3',
            [c.workspaceId, artifact.id, c.actorId],
          )
        ).rows[0];
        if (old) {
          if (old.document_hash !== documentHash) throw new AppError(409, 'AI_ALREADY_APPLIED');
          return { id: old.draft_id };
        }
        const result = await createScenario(c, input.document);
        await db.query(
          'INSERT INTO ai_applications(workspace_id,artifact_id,actor_id,draft_id,document_hash) VALUES($1,$2,$3,$4,$5)',
          [c.workspaceId, artifact.id, c.actorId, result.id, documentHash],
        );
        await audit(db, c.workspaceId, c.actorId, 'ai.proposal_applied', artifact.id, c.requestId, {
          draftId: result.id,
        });
        return result;
      }),
    );
  });
  return router;
}
