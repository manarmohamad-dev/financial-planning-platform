import express, { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import {
  idSchema,
  currencySchema,
  type Permission,
} from '../../../packages/contracts/src/index.js';
import { mappingSchema, LIMITS } from '../../../packages/imports/src/model.js';
import { inspect, suggest, ImportFailure } from '../../../packages/imports/src/parser.js';
import { transaction, audit } from './db.js';
import { workspaceAccess, authorize, type WorkspaceAccess } from './policy.js';
import { AppError } from './errors.js';
import type { PlanningContext } from './planning-service.js';
import {
  uploadImport,
  getImport,
  selectSheet,
  getMapping,
  editMapping,
  confirmMapping,
  getMappingVersion,
  validateMapping,
  confirmDataset,
  readDataset,
  replayDataset,
  saveTemplate,
  applyTemplate,
} from './import-service.js';
export function importRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });
  async function within<T>(
    req: Request,
    res: Response,
    permission: Permission,
    fn: (c: PlanningContext, a: WorkspaceAccess) => Promise<T>,
  ) {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED');
    const actorId = req.user.id,
      workspaceId = idSchema.parse(req.params['workspaceId']);
    try {
      return await transaction(pool, actorId, workspaceId, async (db) => {
        if (req.method !== 'GET')
          await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
        const a = await workspaceAccess(db, workspaceId, actorId);
        authorize(a, permission);
        if (a.kind === 'demo' && permission !== 'data.view')
          throw new AppError(403, 'DEMO_UPLOAD_DISABLED');
        return fn({ db, workspaceId, actorId, requestId: res.locals.requestId }, a);
      });
    } catch (error) {
      if (req.method !== 'GET')
        try {
          await transaction(pool, actorId, workspaceId, async (db) => {
            const a = await workspaceAccess(db, workspaceId, actorId);
            if (a.permissions.includes('data.view'))
              await audit(
                db,
                workspaceId,
                actorId,
                'import.request_rejected',
                randomUUID(),
                res.locals.requestId,
                {
                  code:
                    error instanceof AppError
                      ? error.code
                      : error instanceof ImportFailure
                        ? error.code
                        : error instanceof z.ZodError
                          ? 'VALIDATION_FAILED'
                          : 'INTERNAL_ERROR',
                },
              );
          });
        } catch {
          /* Unauthorized tenant requests must not write into another tenant. */
        }
      if (error instanceof ImportFailure) throw new AppError(422, error.code, error.message);
      throw error;
    }
  }
  router.get('/', async (req, res) =>
    res.json({
      imports: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              'SELECT f.id,f.name,f.file_type,f.status,f.parse_error,f.uploaded_at,EXISTS(SELECT 1 FROM import_cancellations x WHERE x.workspace_id=f.workspace_id AND x.import_id=f.id) AS cancelled FROM import_files f WHERE workspace_id=$1 ORDER BY uploaded_at DESC LIMIT 100',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.post(
    '/',
    async (req, res, next) => {
      await within(req, res, 'data.import', async () => undefined);
      next();
    },
    express.raw({ type: 'application/octet-stream', limit: LIMITS.fileBytes }),
    async (req, res) => {
      res.status(201).json(
        await within(req, res, 'data.import', (c) => {
          if (!Buffer.isBuffer(req.body))
            throw new AppError(
              400,
              'FILE_BODY_REQUIRED',
              'Send an XLSX/CSV file as application/octet-stream.',
            );
          let name: string;
          try {
            name = decodeURIComponent(req.get('x-file-name') ?? '');
          } catch {
            throw new AppError(400, 'FILENAME_INVALID');
          }
          return uploadImport(
            c,
            name,
            req.body,
            req.get('x-csv-delimiter') === 'tab' ? '\t' : (req.get('x-csv-delimiter') ?? ','),
          );
        }),
      );
    },
  );
  router.get('/templates', async (req, res) =>
    res.json({
      templates: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              'SELECT id,name,version,fingerprint FROM import_mapping_templates WHERE workspace_id=$1 ORDER BY created_at DESC',
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.post('/templates', async (req, res) =>
    res.status(201).json(
      await within(req, res, 'mapping.review', (c) => {
        const x = z
          .object({ mappingVersionId: idSchema, name: z.string().trim().min(1).max(100) })
          .strict()
          .parse(req.body);
        return saveTemplate(c, x.mappingVersionId, x.name);
      }),
    ),
  );
  router.get('/datasets', async (req, res) =>
    res.json({
      datasets: await within(
        req,
        res,
        'data.view',
        async (c) =>
          (
            await c.db.query(
              "SELECT id,import_id,mapping_version_id,planning_version_id,normalized_document->>'title' AS title,confirmed_at FROM import_datasets WHERE workspace_id=$1 ORDER BY confirmed_at DESC LIMIT 100",
              [c.workspaceId],
            )
          ).rows,
      ),
    }),
  );
  router.get('/datasets/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) => readDataset(c, idSchema.parse(req.params['id']))),
    ),
  );
  router.post('/datasets/:id/replay', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c, a) =>
        replayDataset(c, idSchema.parse(req.params['id']), currencySchema.parse(a.currency)),
      ),
    ),
  );
  router.get('/mappings/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) => getMapping(c, idSchema.parse(req.params['id']))),
    ),
  );
  router.patch('/mappings/:id', async (req, res) =>
    res.json(
      await within(req, res, 'mapping.review', (c) => {
        const x = z
          .object({ revision: z.number().int().positive(), mapping: mappingSchema })
          .strict()
          .parse(req.body);
        return editMapping(c, idSchema.parse(req.params['id']), x.revision, x.mapping);
      }),
    ),
  );
  router.post('/mappings/:id/validate', async (req, res) =>
    res.json(
      await within(req, res, 'mapping.review', async (c, a) => {
        const d = await getMapping(c, idSchema.parse(req.params['id']));
        return validateMapping(c, d.importId, d.mapping, currencySchema.parse(a.currency));
      }),
    ),
  );
  router.post('/mappings/:id/confirm', async (req, res) =>
    res.status(201).json(
      await within(req, res, 'mapping.review', (c) => {
        const x = z
          .object({ revision: z.number().int().positive(), reviewed: z.literal(true) })
          .strict()
          .parse(req.body);
        return confirmMapping(c, idSchema.parse(req.params['id']), x.revision);
      }),
    ),
  );
  router.post('/mappings/:id/template', async (req, res) =>
    res.json(
      await within(req, res, 'mapping.review', (c) => {
        const x = z
          .object({
            templateId: idSchema,
            revision: z.number().int().positive(),
            reviewBeforeConfirmation: z.literal(true),
          })
          .strict()
          .parse(req.body);
        return applyTemplate(c, idSchema.parse(req.params['id']), x.templateId, x.revision);
      }),
    ),
  );
  router.get('/mapping-versions/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', (c) =>
        getMappingVersion(c, idSchema.parse(req.params['id'])),
      ),
    ),
  );
  router.post('/mapping-versions/:id/validate', async (req, res) =>
    res.json(
      await within(req, res, 'mapping.review', async (c, a) => {
        const v = await getMappingVersion(c, idSchema.parse(req.params['id']));
        return validateMapping(c, v.import_id, v.mapping, currencySchema.parse(a.currency));
      }),
    ),
  );
  router.post('/mapping-versions/:id/dataset', async (req, res) =>
    res.status(201).json(
      await within(req, res, 'dataset.confirm', (c, a) => {
        const x = z
          .object({
            confirmed: z.literal(true),
            acceptedWarnings: z.array(z.string().max(100)).max(100),
          })
          .strict()
          .parse(req.body);
        return confirmDataset(
          c,
          idSchema.parse(req.params['id']),
          currencySchema.parse(a.currency),
          x.acceptedWarnings,
        );
      }),
    ),
  );
  router.get('/:id', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) => {
        const f = await getImport(c, idSchema.parse(req.params['id']));
        const drafts = (
          await c.db.query(
            'SELECT id,revision,mapping FROM import_mapping_drafts WHERE workspace_id=$1 AND import_id=$2 ORDER BY updated_at DESC',
            [c.workspaceId, f.id],
          )
        ).rows;
        return {
          ...f,
          raw: undefined,
          sheets:
            f.raw?.sheets.map((s) => ({
              name: s.name,
              rows: s.rows.length,
              columns: Math.max(0, ...s.rows.map((r) => r.length)),
            })) ?? [],
          warnings: f.raw?.warnings ?? [],
          drafts,
        };
      }),
    ),
  );
  router.get('/:id/preview', async (req, res) =>
    res.json(
      await within(req, res, 'data.view', async (c) => {
        const f = await getImport(c, idSchema.parse(req.params['id']));
        if (!f.raw) throw new AppError(422, 'PARSE_FAILED', f.parse_error ?? 'Parse failed');
        const q = z
          .object({
            sheet: z.string().min(1),
            headerRow: z.coerce.number().int().min(1).max(20).default(1),
          })
          .parse(req.query);
        const inspection = inspect(f.raw, q.sheet, q.headerRow);
        return { inspection, suggestions: suggest(inspection) };
      }),
    ),
  );
  router.get('/:id/original', async (req, res) => {
    const f = await within(req, res, 'data.view', async (c) => {
      await getImport(c, idSchema.parse(req.params['id']));
      return (
        await c.db.query('SELECT original FROM import_files WHERE workspace_id=$1 AND id=$2', [
          c.workspaceId,
          req.params['id'],
        ])
      ).rows[0];
    });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="original-import.bin"');
    res.send(f.original);
  });
  router.post('/:id/select-sheet', async (req, res) =>
    res.status(201).json(
      await within(req, res, 'mapping.review', (c) => {
        const x = z
          .object({ sheet: z.string().min(1).max(100), headerRow: z.number().int().min(1).max(20) })
          .strict()
          .parse(req.body);
        return selectSheet(c, idSchema.parse(req.params['id']), x.sheet, x.headerRow);
      }),
    ),
  );
  router.post('/:id/cancel', async (req, res) =>
    res.json(
      await within(req, res, 'data.import', async (c) => {
        const id = idSchema.parse(req.params['id']);
        await getImport(c, id);
        await c.db.query(
          'INSERT INTO import_cancellations(workspace_id,import_id,cancelled_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [c.workspaceId, id, c.actorId],
        );
        await audit(c.db, c.workspaceId, c.actorId, 'import.cancelled', id, c.requestId);
        return { cancelled: true };
      }),
    ),
  );
  return router;
}
