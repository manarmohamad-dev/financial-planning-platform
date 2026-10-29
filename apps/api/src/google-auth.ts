import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { Express, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { transaction } from './db.js';
import { verifyPassword } from './password.js';

export type GoogleIdentity = { subject: string; email: string; name: string };
export type GoogleVerifier = (credential: string, nonce: string) => Promise<GoogleIdentity>;
export function createGoogleVerifier(clientId: string): GoogleVerifier {
  const client = new OAuth2Client();
  return async (credential, nonce) => {
    try {
      const payload = (await client.verifyIdToken({ idToken: credential, audience: clientId })).getPayload();
      if (!nonce || !payload?.sub || !payload.email || !payload.email_verified || payload.nonce !== nonce)
        throw new Error('Incomplete identity');
      return { subject: payload.sub, email: payload.email.toLowerCase().trim(), name: (payload.name || payload.email).slice(0, 80) };
    } catch { throw new AppError(401, 'INVALID_GOOGLE_CREDENTIAL'); }
  };
}
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const proof = z.object({ credential: z.string().min(20).max(10000), nonce: z.string().regex(/^[\w-]{43}$/) }).strict();

// Mounted after the existing origin + session CSRF middleware.
export function googleAuthRoutes(app: Express, config: Config, pool: Pool, limiter: RequestHandler, verifier = createGoogleVerifier(config.GOOGLE_CLIENT_ID)) {
  const enabled = () => {
    if (!config.GOOGLE_AUTH_ENABLED || !config.GOOGLE_CLIENT_ID) throw new AppError(404, 'GOOGLE_AUTH_DISABLED');
  };
  app.get('/api/v1/auth/google/config', (_req, res) => res.json({ enabled: config.GOOGLE_AUTH_ENABLED, clientId: config.GOOGLE_AUTH_ENABLED ? config.GOOGLE_CLIENT_ID : '' }));
  app.post('/api/v1/auth/google/challenge', limiter, async (req, res) => {
    enabled();
    const nonce = randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM google_auth_challenges WHERE expires_at <= now()');
    await pool.query("INSERT INTO google_auth_challenges(nonce_hash,session_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')", [digest(nonce), digest(req.sessionID)]);
    res.json({ nonce });
  });
  for (const linking of [false, true]) {
    app.post(`/api/v1/auth/google${linking ? '/link' : ''}`, limiter, async (req, res) => {
      enabled();
      if (linking && !req.user) throw new AppError(401, 'UNAUTHENTICATED');
      const input = linking ? proof.extend({ password: z.string().min(1).max(128) }).parse(req.body) : proof.parse(req.body);
      const consumed = await pool.query('DELETE FROM google_auth_challenges WHERE nonce_hash=$1 AND session_hash=$2 AND expires_at>now() RETURNING nonce_hash', [digest(input.nonce), digest(req.sessionID)]);
      if (!consumed.rowCount) throw new AppError(401, 'GOOGLE_CHALLENGE_EXPIRED');
      const identity = await verifier(input.credential, input.nonce);
      let user: Express.User;
      try {
        user = await transaction(pool, req.user?.id ?? '', undefined, async db => {
          if (linking) {
            const current = (await db.query('SELECT id,email,display_name,password_hash FROM users WHERE id=$1', [req.user!.id])).rows[0];
            if (!current?.password_hash || !('password' in input) || typeof input.password !== 'string' || !(await verifyPassword(input.password, current.password_hash)))
              throw new AppError(401, 'INVALID_CREDENTIALS');
            if (current.email !== identity.email) throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT');
            await db.query('INSERT INTO google_identities(subject,user_id) VALUES($1,$2)', [identity.subject, current.id]);
            return { id: current.id, email: current.email, displayName: current.display_name };
          }
          const existing = (await db.query('SELECT u.id,u.email,u.display_name FROM users u JOIN google_identities g ON g.user_id=u.id WHERE g.subject=$1', [identity.subject])).rows[0];
          if (existing) return { id: existing.id, email: existing.email, displayName: existing.display_name };
          if ((await db.query('SELECT id FROM users WHERE email=$1', [identity.email])).rowCount) throw new AppError(409, 'GOOGLE_LINK_REQUIRED');
          const id = randomUUID();
          await db.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,NULL)', [id, identity.email, identity.name]);
          await db.query('INSERT INTO google_identities(subject,user_id) VALUES($1,$2)', [identity.subject, id]);
          return { id, email: identity.email, displayName: identity.name };
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT');
        throw error;
      }
      if (linking) { res.json({ linked: true }); return; }
      await new Promise<void>((resolve, reject) => req.logIn(user, error => error ? reject(error) : resolve()));
      req.session.csrfToken = randomBytes(32).toString('hex');
      res.json({ user: req.user, csrfToken: req.session.csrfToken });
    });
  }
}
