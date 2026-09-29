import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stressRoutes } from './stress-routes.js';
import { forecastRoutes } from './forecast-routes.js';
import type { ForecastRunner } from './forecast-runtime.js';
import { importRoutes } from './import-routes.js';
import { planningRoutes } from './planning-routes.js';
import { scenarioRoutes } from './scenario-routes.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Passport } from 'passport';
import { Strategy } from 'passport-local';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z, ZodError } from 'zod';
import {
  currencySchema,
  draftPayloadSchema,
  idSchema,
  permissionSchema,
  CONTRACT_VERSION,
  type Permission,
} from '../../../packages/contracts/src/index.js';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { audit, transaction } from './db.js';
import { workspaceAccess, authorize, type WorkspaceAccess } from './policy.js';
import { hashPassword, verifyPassword } from './password.js';
import { logger, safeRequestLog } from './logging.js';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      displayName: string;
    }
  }
}
declare module 'express-session' {
  interface SessionData {
    csrfToken: string;
  }
}
const credentials = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
const registration = credentials.extend({ displayName: z.string().trim().min(1).max(80) });
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const requireUser = (req: Request) => {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED');
  return req.user;
};
const rid = (res: Response): string => res.locals.requestId;

export async function createApp(config: Config, pool: Pool, forecastRunner?: ForecastRunner) {
  const databaseRole = (
    await pool.query(
      "SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='workspaces' AND tableowner=current_user) AS owns_business_tables FROM pg_roles r WHERE r.rolname=current_user",
    )
  ).rows[0];
  if (
    !databaseRole ||
    databaseRole.rolsuper ||
    databaseRole.rolbypassrls ||
    databaseRole.owns_business_tables
  )
    throw new Error('UNSAFE_DATABASE_ROLE');
  const app = express();
  const passport = new Passport();
  const Store = connectPgSimple(session);
  const store = new Store({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: false,
  });
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  passport.use(
    new Strategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const result = await pool.query(
            'SELECT id,email,display_name,password_hash FROM users WHERE email=$1',
            [email.toLowerCase()],
          );
          const row = result.rows[0];
          const valid = await verifyPassword(password, row?.password_hash ?? dummyHash);
          if (!row || !valid) return done(null, false);
          done(null, { id: row.id, email: row.email, displayName: row.display_name });
        } catch (e) {
          done(e);
        }
      },
    ),
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const row = (await pool.query('SELECT id,email,display_name FROM users WHERE id=$1', [id]))
        .rows[0];
      done(null, row ? { id: row.id, email: row.email, displayName: row.display_name } : false);
    } catch (e) {
      done(e);
    }
  });
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-Id', rid(res));
    res.on('finish', () =>
      logger.info(safeRequestLog(req.method, req.path, res.statusCode, rid(res)), 'request'),
    );
    next();
  });
  app.use(helmet());
  app.use(express.json({ limit: '64kb', strict: true }));
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 200,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: rid(res) },
      }),
  });
  app.use('/api', limiter);
  app.use(
    session({
      store,
      name: config.NODE_ENV === 'production' ? '__Host-planner.sid' : 'planner.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const token = req.get('x-csrf-token');
    const expected = req.session.csrfToken;
    if (
      origin !== config.APP_ORIGIN ||
      !token ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !expected ||
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      return next(new AppError(403, 'CSRF_INVALID'));
    next();
  });
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok', milestone: 1 }));
  app.get('/api/v1/auth/csrf', (req, res) => {
    req.session.csrfToken ??= randomBytes(32).toString('hex');
    res.json({ token: req.session.csrfToken });
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts',
          requestId: rid(res),
        },
      }),
  });
  app.post('/api/v1/auth/register', authLimiter, async (req, res) => {
    const input = registration.parse(req.body);
    const id = randomUUID();
    try {
      await pool.query(
        'INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',
        [id, input.email, input.displayName, await hashPassword(input.password)],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new AppError(409, 'ACCOUNT_UNAVAILABLE');
      throw e;
    }
    await new Promise<void>((resolve, reject) =>
      req.logIn({ id, email: input.email, displayName: input.displayName }, (e) =>
        e ? reject(e) : resolve(),
      ),
    );
    req.session.csrfToken = randomBytes(32).toString('hex');
    res.status(201).json({ user: req.user, csrfToken: req.session.csrfToken });
  });
  app.post('/api/v1/auth/login', authLimiter, (req, res, next) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return next(new AppError(400, 'VALIDATION_FAILED'));
    passport.authenticate('local', (error: unknown, user: Express.User | false) => {
      if (error) return next(error);
      if (!user) return next(new AppError(401, 'INVALID_CREDENTIALS'));
      req.logIn(user, (e) => {
        if (e) return next(e);
        req.session.csrfToken = randomBytes(32).toString('hex');
        res.json({ user, csrfToken: req.session.csrfToken });
      });
    })(req, res, next);
  });
  app.post('/api/v1/auth/logout', (req, res, next) => {
    requireUser(req);
    req.logout((e) => {
      if (e) return next(e);
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie(config.NODE_ENV === 'production' ? '__Host-planner.sid' : 'planner.sid', {
          path: '/',
        });
        res.status(204).end();
      });
    });
  });
  app.get('/api/v1/auth/me', (req, res) => res.json({ user: requireUser(req) }));

  app.get('/api/v1/workspaces', async (req, res) => {
    const user = requireUser(req);
    const rows = await transaction(
      pool,
      user.id,
      undefined,
      async (db) =>
        (
          await db.query(
            'SELECT w.id,w.name,w.kind,w.currency,w.status,w.revision,m.role FROM workspaces w LEFT JOIN memberships m ON m.workspace_id=w.id AND m.user_id=$1 ORDER BY w.created_at',
            [user.id],
          )
        ).rows,
    );
    res.json({ workspaces: rows });
  });
  async function createWorkspace(req: Request, res: Response, kind: 'company' | 'demo') {
    const user = requireUser(req);
    const input =
      kind === 'company'
        ? z
            .object({ name: z.string().trim().min(1).max(120), currency: currencySchema })
            .strict()
            .parse(req.body)
        : { name: 'Personal demo', currency: 'EGP' };
    const result = await transaction(pool, user.id, undefined, async (db) => {
      // Serialize per-user demo creation to avoid duplicate contexts.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [user.id]);
      if (kind === 'demo') {
        const found = await db.query(
          "SELECT id FROM workspaces WHERE kind='demo' AND created_by=$1",
          [user.id],
        );
        if (found.rows[0]) return { id: found.rows[0].id, existing: true };
      }
      const id = randomUUID();
      await db.query(
        'INSERT INTO workspaces(id,kind,name,currency,created_by) VALUES($1,$2,$3,$4,$5)',
        [id, kind, input.name, input.currency, user.id],
      );
      await db.query("SELECT set_config('app.workspace_id',$1,true)", [id]);
      if (kind === 'company') await db.query('SELECT bootstrap_owner($1)', [id]);
      await audit(db, id, user.id, 'workspace.created', id, rid(res), { kind });
      return { id, existing: false };
    });
    res.status(result.existing ? 200 : 201).json(result);
  }
  app.post('/api/v1/workspaces', (req, res) => createWorkspace(req, res, 'company'));
  app.post('/api/v1/demo', (req, res) => createWorkspace(req, res, 'demo'));
  app.post('/api/v1/invitations/accept', async (req, res) => {
    const user = requireUser(req);
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(req.body);
    const workspaceId = await transaction(pool, user.id, undefined, async (db) => {
      let result;
      try {
        result = await db.query('SELECT accept_invitation($1) AS id', [digest(token)]);
      } catch (e) {
        if ((e as Error).message.includes('INVITATION_INVALID'))
          throw new AppError(400, 'INVITATION_INVALID');
        throw e;
      }
      const id = result.rows[0].id as string;
      await db.query("SELECT set_config('app.workspace_id',$1,true)", [id]);
      await audit(db, id, user.id, 'membership.joined', user.id, rid(res));
      return id;
    });
    res.json({ workspaceId });
  });
  async function inWorkspace<T>(
    req: Request,
    permission: Permission,
    fn: (db: PoolClient, access: WorkspaceAccess, user: Express.User) => Promise<T>,
    lock = false,
  ): Promise<T> {
    const user = requireUser(req);
    const workspaceId = idSchema.parse(req.params['workspaceId']);
    return transaction(pool, user.id, workspaceId, async (db) => {
      if (lock) await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
      const access = await workspaceAccess(db, workspaceId, user.id);
      authorize(access, permission);
      return fn(db, access, user);
    });
  }
  const base = '/api/v1/workspaces/:workspaceId';
  app.get(base, async (req, res) =>
    res.json(await inWorkspace(req, 'data.view', async (_db, access) => access)),
  );
  // Permission decisions are intentionally exposed for UX; this executes the same authorization path as operational endpoints.
  app.get(`${base}/access/:permission`, async (req, res) => {
    const permission = permissionSchema.parse(req.params['permission']);
    await inWorkspace(req, permission, async () => undefined);
    res.status(204).end();
  });
  app.patch(base, async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(1).max(120), revision: z.number().int().positive() })
      .strict()
      .parse(req.body);
    res.json(
      await inWorkspace(
        req,
        'workspace.edit',
        async (db, access, user) => {
          const result = await db.query(
            'UPDATE workspaces SET name=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING id,name,revision',
            [input.name, access.id, input.revision],
          );
          if (!result.rowCount) throw new AppError(409, 'VERSION_CONFLICT');
          await audit(db, access.id, user.id, 'workspace.updated', access.id, rid(res));
          return result.rows[0];
        },
        true,
      ),
    );
  });
  app.post(`${base}/archive`, async (req, res) => {
    await inWorkspace(
      req,
      'workspace.archive',
      async (db, access, user) => {
        await db.query("UPDATE workspaces SET status='archived',revision=revision+1 WHERE id=$1", [
          access.id,
        ]);
        await audit(db, access.id, user.id, 'workspace.archived', access.id, rid(res));
      },
      true,
    );
    res.status(204).end();
  });
  app.get(`${base}/members`, async (req, res) =>
    res.json({
      members: await inWorkspace(
        req,
        'members.manage',
        async (db, a) =>
          (
            await db.query(
              'SELECT m.user_id,m.role,u.display_name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE workspace_id=$1 ORDER BY m.created_at',
              [a.id],
            )
          ).rows,
      ),
    }),
  );
  app.post(`${base}/invitations`, async (req, res) => {
    const input = z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        role: z.enum(['MANAGER', 'ANALYST']),
      })
      .strict()
      .parse(req.body);
    res.status(201).json(
      await inWorkspace(
        req,
        'members.manage',
        async (db, access, user) => {
          const id = randomUUID();
          const token = randomBytes(32).toString('hex');
          await db.query(
            "INSERT INTO invitations(id,workspace_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours',$6)",
            [id, access.id, input.email, input.role, digest(token), user.id],
          );
          await audit(db, access.id, user.id, 'membership.invited', id, rid(res), {
            role: input.role,
          });
          return { id, token, expiresInHours: 24 };
        },
        true,
      ),
    );
  });
  async function changeMember(req: Request, res: Response, remove: boolean) {
    const target = idSchema.parse(req.params['userId']);
    const role = remove
      ? undefined
      : z
          .object({ role: z.enum(['MANAGER', 'ANALYST']) })
          .strict()
          .parse(req.body).role;
    await inWorkspace(
      req,
      'members.manage',
      async (db, access, user) => {
        const member = (
          await db.query('SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2', [
            access.id,
            target,
          ])
        ).rows[0];
        if (!member) throw new AppError(404, 'NOT_FOUND');
        if (member.role === 'OWNER') {
          const count = Number(
            (
              await db.query(
                "SELECT count(*) FROM memberships WHERE workspace_id=$1 AND role='OWNER'",
                [access.id],
              )
            ).rows[0].count,
          );
          throw new AppError(409, count <= 1 ? 'LAST_OWNER' : 'OWNERSHIP_TRANSFER_REQUIRED');
        }
        if (remove)
          await db.query('DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2', [
            access.id,
            target,
          ]);
        else
          await db.query('UPDATE memberships SET role=$3 WHERE workspace_id=$1 AND user_id=$2', [
            access.id,
            target,
            role,
          ]);
        await audit(
          db,
          access.id,
          user.id,
          remove ? 'membership.removed' : 'membership.role_changed',
          target,
          rid(res),
          role ? { role } : {},
        );
      },
      true,
    );
    res.status(204).end();
  }
  app.patch(`${base}/members/:userId`, (req, res) => changeMember(req, res, false));
  app.delete(`${base}/members/:userId`, (req, res) => changeMember(req, res, true));
  app.post(`${base}/ownership-transfer`, async (req, res) => {
    const { targetUserId } = z.object({ targetUserId: idSchema }).strict().parse(req.body);
    await inWorkspace(
      req,
      'ownership.transfer',
      async (db, access, user) => {
        if (targetUserId === user.id) throw new AppError(400, 'INVALID_TRANSFER');
        const result = await db.query(
          "UPDATE memberships SET role='OWNER' WHERE workspace_id=$1 AND user_id=$2",
          [access.id, targetUserId],
        );
        if (!result.rowCount) throw new AppError(404, 'NOT_FOUND');
        await db.query(
          "UPDATE memberships SET role='MANAGER' WHERE workspace_id=$1 AND user_id=$2",
          [access.id, user.id],
        );
        await audit(db, access.id, user.id, 'ownership.transferred', targetUserId, rid(res));
      },
      true,
    );
    res.status(204).end();
  });
  app.get(`${base}/audit`, async (req, res) =>
    res.json({
      events: await inWorkspace(
        req,
        'data.view',
        async (db, a) =>
          (
            await db.query(
              'SELECT id,action,resource_id,actor_id,created_at,metadata FROM audit_events WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',
              [a.id],
            )
          ).rows,
      ),
    }),
  );
  app.get(`${base}/drafts`, async (req, res) =>
    res.json({
      drafts: await inWorkspace(
        req,
        'data.view',
        async (db, a) =>
          (
            await db.query(
              'SELECT id,payload,revision,updated_at FROM planning_drafts WHERE workspace_id=$1 ORDER BY updated_at DESC',
              [a.id],
            )
          ).rows,
      ),
    }),
  );
  app.post(`${base}/drafts`, async (req, res) => {
    const input = draftPayloadSchema.parse(req.body);
    res.status(201).json(
      await inWorkspace(req, 'baseline.edit', async (db, a, user) => {
        if (input.assumptions.some((x) => x.currency !== a.currency))
          throw new AppError(422, 'CURRENCY_MISMATCH');
        const id = randomUUID();
        await db.query(
          'INSERT INTO planning_drafts(id,workspace_id,payload,created_by) VALUES($1,$2,$3,$4)',
          [id, a.id, input, user.id],
        );
        await audit(db, a.id, user.id, 'assumption.draft_created', id, rid(res));
        return { id, revision: 1, payload: input };
      }),
    );
  });
  app.get(`${base}/drafts/:draftId`, async (req, res) =>
    res.json(
      await inWorkspace(req, 'data.view', async (db, a) => {
        const row = (
          await db.query(
            'SELECT id,payload,revision FROM planning_drafts WHERE workspace_id=$1 AND id=$2',
            [a.id, idSchema.parse(req.params['draftId'])],
          )
        ).rows[0];
        if (!row) throw new AppError(404, 'NOT_FOUND');
        return row;
      }),
    ),
  );
  app.patch(`${base}/drafts/:draftId`, async (req, res) => {
    const input = z
      .object({ revision: z.number().int().positive(), payload: draftPayloadSchema })
      .strict()
      .parse(req.body);
    res.json(
      await inWorkspace(req, 'baseline.edit', async (db, a, user) => {
        if (input.payload.assumptions.some((x) => x.currency !== a.currency))
          throw new AppError(422, 'CURRENCY_MISMATCH');
        const id = idSchema.parse(req.params['draftId']);
        const row = (
          await db.query(
            'UPDATE planning_drafts SET payload=$1,revision=revision+1,updated_at=now() WHERE workspace_id=$2 AND id=$3 AND revision=$4 RETURNING id,payload,revision',
            [input.payload, a.id, id, input.revision],
          )
        ).rows[0];
        if (!row) throw new AppError(409, 'VERSION_CONFLICT');
        await audit(db, a.id, user.id, 'assumption.draft_updated', id, rid(res));
        return row;
      }),
    );
  });
  app.post(`${base}/drafts/:draftId/confirm`, async (req, res) => {
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(req.body);
    res.status(201).json(
      await inWorkspace(req, 'baseline.edit', async (db, a, user) => {
        const draftId = idSchema.parse(req.params['draftId']);
        const draft = (
          await db.query(
            'SELECT payload,revision FROM planning_drafts WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
            [a.id, draftId],
          )
        ).rows[0];
        if (!draft) throw new AppError(404, 'NOT_FOUND');
        if (draft.revision !== revision) throw new AppError(409, 'VERSION_CONFLICT');
        const existing = (
          await db.query(
            'SELECT id FROM assumption_versions WHERE workspace_id=$1 AND draft_id=$2 AND draft_revision=$3',
            [a.id, draftId, revision],
          )
        ).rows[0];
        if (existing) return { id: existing.id };
        const id = randomUUID();
        await db.query(
          'INSERT INTO assumption_versions(id,workspace_id,draft_id,draft_revision,payload,contract_version,confirmed_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [id, a.id, draftId, revision, draft.payload, CONTRACT_VERSION, user.id],
        );
        await audit(db, a.id, user.id, 'assumption.confirmed', id, rid(res), { revision });
        return { id };
      }),
    );
  });
  app.get(`${base}/versions/:versionId`, async (req, res) =>
    res.json(
      await inWorkspace(req, 'data.view', async (db, a) => {
        const row = (
          await db.query(
            'SELECT id,payload,contract_version,confirmed_at FROM assumption_versions WHERE workspace_id=$1 AND id=$2',
            [a.id, idSchema.parse(req.params['versionId'])],
          )
        ).rows[0];
        if (!row) throw new AppError(404, 'NOT_FOUND');
        return row;
      }),
    ),
  );
  app.use('/api/v1/workspaces/:workspaceId/imports', importRoutes(pool));
  app.use('/api/v1/workspaces/:workspaceId/stress', stressRoutes(pool));
  app.use('/api/v1/workspaces/:workspaceId/forecasts', forecastRoutes(pool, forecastRunner));
  app.use('/api/v1/workspaces/:workspaceId/planning', planningRoutes(pool));
  app.use('/api/v1/workspaces/:workspaceId/scenarios', scenarioRoutes(pool));
  // Serve the built Angular shell for direct workspace links without intercepting API errors.
  const webRoot = resolve('dist/web/browser');
  if (existsSync(resolve(webRoot, 'index.html'))) {
    app.use((req, res, next) =>
      req.path.startsWith('/api') ? next() : express.static(webRoot)(req, res, next),
    );
    app.get(
      ['/', '/workspaces', '/workspaces/:workspaceId/:page', '/account', '/sign-in', '/sign-up'],
      (_req, res) => res.sendFile(resolve(webRoot, 'index.html')),
    );
  }
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND')));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e =
      error instanceof AppError
        ? error
        : error instanceof ZodError
          ? new AppError(400, 'VALIDATION_FAILED', 'Request does not match the contract')
          : (error as { type?: string }).type === 'entity.too.large'
            ? new AppError(413, 'BODY_TOO_LARGE')
            : error instanceof SyntaxError
              ? new AppError(400, 'INVALID_JSON')
              : new AppError(500, 'INTERNAL_ERROR');
    if (e.status === 500) logger.error({ requestId: rid(res), code: e.code }, 'Request failed');
    res
      .status(e.status)
      .json({
        error: { code: e.code, message: e.message, details: e.details, requestId: rid(res) },
      });
  });
  return app;
}
