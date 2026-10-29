import {stressSource,stressDefinition} from './stress-helpers.js';
import {claimChild,finishChild} from '../apps/api/src/stress-service.js';
import {syntheticFixture} from '../packages/planning/src/fixtures.js';
import {documents as forecastDocuments,futureTemplate} from './forecast-helpers.js';
import type {PlanningDocument} from '../packages/planning/src/model.js';
import {fixtureBytes,fixtureRaw,reviewed} from './import-helpers.js';
import type {Mapping} from '../packages/imports/src/model.js';
import {zip} from './zip-fixtures.js';
import {syntheticScenario} from '../packages/scenarios/src/fixtures.js';
import type {BaselineSnapshot} from '../packages/planning/src/model.js';
import type {ScenarioDocument} from '../packages/scenarios/src/model.js';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { Pool } from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { transaction } from '../apps/api/src/db.js';
import { migrate } from '../scripts/migrate.js';
import { permissions, type Role } from '../packages/contracts/src/index.js';
import { logger } from '../apps/api/src/logging.js';
// Independently transcribed acceptance oracle from the user's final contract.
const accepted: Record<Role, readonly string[]> = {
  OWNER: [
    'data.view',
    'data.edit',
    'data.import',
    'mapping.review',
    'dataset.confirm',
    'baseline.edit',
    'baseline.publish',
    'scenario.edit',
    'scenario.run',
    'stress.run',
    'comparison.view',
    'ai.use',
    'brief.prepare',
    'risk.edit',
    'members.manage',
    'workspace.edit',
    'workspace.archive',
    'workspace.delete',
    'ownership.transfer',
  ],
  MANAGER: [
    'data.view',
    'baseline.edit',
    'baseline.publish',
    'scenario.edit',
    'scenario.run',
    'stress.run',
    'comparison.view',
    'ai.use',
    'brief.prepare',
  ],
  ANALYST: [
    'data.view',
    'data.edit',
    'data.import',
    'mapping.review',
    'dataset.confirm',
    'baseline.edit',
    'scenario.edit',
    'scenario.run',
    'stress.run',
    'comparison.view',
    'ai.use',
    'brief.prepare',
  ],
};
const acceptedDemo = [
  'data.view',
  'scenario.edit',
  'scenario.run',
  'stress.run',
  'comparison.view',
  'ai.use',
  'brief.prepare',
];
let embedded: EmbeddedPostgres | undefined;
let admin: Pool;
let pool: Pool;
let app: Express;
const origin = 'http://localhost:4200';
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; id: string; email: string };
async function client(name: string): Promise<Client> {
  const agent = request.agent(app);
  const email = `${name}-${randomUUID()}@example.test`;
  const token = (await agent.get('/api/v1/auth/csrf').expect(200)).body.token;
  const result = await agent
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', token)
    .send({ email, password: 'Foundation-password-123', displayName: name })
    .expect(201);
  return { agent, email, csrf: result.body.csrfToken, id: result.body.user.id };
}
function post(c: Client, path: string, body: unknown = {}) {
  return c.agent
    .post('/api/v1' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(body as object);
}
function patch(c: Client, path: string, body: unknown) {
  return c.agent
    .patch('/api/v1' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(body as object);
}
function del(c: Client, path: string) {
  return c.agent
    .delete('/api/v1' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf);
}
async function company(c: Client) {
  return (await post(c, '/workspaces', { name: 'Test company', currency: 'EGP' }).expect(201)).body
    .id as string;
}
async function join(
  owner: Client,
  target: Client,
  workspaceId: string,
  role: 'MANAGER' | 'ANALYST',
) {
  const invite = await post(owner, `/workspaces/${workspaceId}/invitations`, {
    email: target.email,
    role,
  }).expect(201);
  await post(target, '/invitations/accept', { token: invite.body.token }).expect(200);
  return invite.body.token as string;
}
beforeAll(async () => {
  logger.level = 'silent';
  const password = randomBytes(24).toString('hex');
  const external = process.env.TEST_ADMIN_DATABASE_URL;
  if (!external) {
    const directory = resolve('.local', `test-pg-${randomUUID()}`);
    await mkdir(directory, { recursive: true });
    embedded = new EmbeddedPostgres({
      initdbFlags: ['--encoding=UTF8'],
      databaseDir: directory,
      user: 'postgres',
      password,
      port: 55439,
      persistent: true,
      authMethod: 'scram-sha-256',
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => undefined,
      onError: () => undefined,
    });
    await embedded.initialise();
    await embedded.start();
  }
  const url = external ?? `postgresql://postgres:${password}@127.0.0.1:55439/postgres`;
  const bootstrap = new Pool({ connectionString: url });
  const dbName = `planner_test_${randomBytes(8).toString('hex')}`;
  await bootstrap.query(`CREATE DATABASE ${dbName}`);
  await bootstrap.end();
  const adminUrl = new URL(url);
  adminUrl.pathname = '/' + dbName;
  admin = new Pool({ connectionString: adminUrl.toString() });
  await migrate(admin);
  await migrate(admin);
  await admin.query(`ALTER ROLE planner_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
  const appUrl = new URL(adminUrl);
  appUrl.username = 'planner_app';
  appUrl.password = password;
  pool = new Pool({ connectionString: appUrl.toString(), max: 8 });
  app = await createApp(
    readConfig({
      NODE_ENV: 'test',
      APP_ORIGIN: origin,
      DATABASE_URL: appUrl.toString(),
      SESSION_SECRET: randomBytes(48).toString('hex'),
    }),
    pool,
  );
});
afterAll(async () => {
  if (pool) await pool.end();
  if (admin) await admin.end();
  if (embedded) await embedded.stop();
});

describe('real authentication and sessions', () => {
  it('creates a Google-only user without granting workspace access and rejects foreign or expired proofs', async () => {
    const email = `google-new-${randomUUID()}@example.test`;
    const googleApp = await createApp(readConfig({
      NODE_ENV: 'test', APP_ORIGIN: origin, DATABASE_URL: 'postgresql://test-only/unused',
      SESSION_SECRET: randomBytes(48).toString('hex'), GOOGLE_AUTH_ENABLED: 'true', GOOGLE_CLIENT_ID: 'test-only-not-a-live-client',
    }), pool, undefined, undefined, async () => ({ subject: randomUUID(), email, name: 'Synthetic Google' }));
    const a = request.agent(googleApp), b = request.agent(googleApp);
    const csrf = (await a.get('/api/v1/auth/csrf')).body.token;
    const otherCsrf = (await b.get('/api/v1/auth/csrf')).body.token;
    const send = (path: string, body: object = {}) => a.post('/api/v1/auth/google' + path).set('Origin', origin).set('X-CSRF-Token', csrf).send(body);
    const nonce = (await send('/challenge').expect(200)).body.nonce;
    await b.post('/api/v1/auth/google').set('Origin', origin).set('X-CSRF-Token', otherCsrf).send({ nonce, credential: 'test-provider-credential-only' }).expect(401);
    const result = await send('', { nonce, credential: 'test-provider-credential-only' }).expect(200);
    expect(result.body.user.email).toBe(email);
    expect((await a.get('/api/v1/workspaces')).body.workspaces).toEqual([]);
    expect((await admin.query('SELECT password_hash FROM users WHERE id=$1', [result.body.user.id])).rows[0].password_hash).toBeNull();
    const expired = (await b.post('/api/v1/auth/google/challenge').set('Origin', origin).set('X-CSRF-Token', otherCsrf).send({}).expect(200)).body.nonce;
    await admin.query("UPDATE google_auth_challenges SET expires_at=now()-interval '1 minute'");
    await b.post('/api/v1/auth/google').set('Origin', origin).set('X-CSRF-Token', otherCsrf).send({ nonce: expired, credential: 'test-provider-credential-only' }).expect(401);
  });
  it('Google requires session CSRF, explicit linking and a single-use nonce', async () => {
    // An injected provider proof tests application security; this is not a live Google login.
    const owner = await client('google-link');
    const googleApp = await createApp(readConfig({
      NODE_ENV: 'test', APP_ORIGIN: origin, DATABASE_URL: 'postgresql://test-only/unused',
      SESSION_SECRET: randomBytes(48).toString('hex'), GOOGLE_AUTH_ENABLED: 'true', GOOGLE_CLIENT_ID: 'test-only-not-a-live-client',
    }), pool, undefined, undefined, async () => ({ subject: 'test-subject', email: owner.email, name: 'Test Google' }));
    const agent = request.agent(googleApp);
    let csrf = (await agent.get('/api/v1/auth/csrf')).body.token;
    const send = (path: string, body: object = {}) => agent.post('/api/v1/auth/google' + path).set('Origin', origin).set('X-CSRF-Token', csrf).send(body);
    await agent.post('/api/v1/auth/google/challenge').send({}).expect(403);
    let nonce = (await send('/challenge').expect(200)).body.nonce;
    await send('', { credential: 'test-provider-credential-only', nonce }).expect(409).expect(r => expect(r.body.error.code).toBe('GOOGLE_LINK_REQUIRED'));
    await send('', { credential: 'test-provider-credential-only', nonce }).expect(401);
    const login = await agent.post('/api/v1/auth/login').set('Origin', origin).set('X-CSRF-Token', csrf).send({ email: owner.email, password: 'Foundation-password-123' }).expect(200);
    csrf = login.body.csrfToken;
    nonce = (await send('/challenge').expect(200)).body.nonce;
    await send('/link', { credential: 'test-provider-credential-only', nonce, password: 'wrong-password' }).expect(401);
    nonce = (await send('/challenge').expect(200)).body.nonce;
    await send('/link', { credential: 'test-provider-credential-only', nonce, password: 'Foundation-password-123' }).expect(200);
    await agent.post('/api/v1/auth/logout').set('Origin', origin).set('X-CSRF-Token', csrf).expect(204);
    csrf = (await agent.get('/api/v1/auth/csrf')).body.token;
    nonce = (await send('/challenge').expect(200)).body.nonce;
    const signedIn = await send('', { credential: 'test-provider-credential-only', nonce }).expect(200);
    expect(signedIn.body.user.id).toBe(owner.id);
    await agent.get('/api/v1/auth/me').expect(200);
    expect((await agent.get('/api/v1/workspaces')).body.workspaces).toEqual([]);
  });
  it('registers, reads user, logs out, rejects old session, logs in again', async () => {
    const c = await client('lifecycle');
    await c.agent.get('/api/v1/auth/me').expect(200);
    await post(c, '/auth/logout').expect(204);
    await c.agent.get('/api/v1/auth/me').expect(401);
    c.csrf = (await c.agent.get('/api/v1/auth/csrf')).body.token;
    const login = await post(c, '/auth/login', {
      email: c.email,
      password: 'Foundation-password-123',
    }).expect(200);
    expect(login.body.csrfToken).not.toBe(c.csrf);
    const cookie = String(login.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
  it('rejects wrong password and expired server session', async () => {
    const c = await client('expiry');
    await post(c, '/auth/logout').expect(204);
    c.csrf = (await c.agent.get('/api/v1/auth/csrf')).body.token;
    await post(c, '/auth/login', { email: c.email, password: 'wrong-password-123' }).expect(401);
    const login = await post(c, '/auth/login', {
      email: c.email,
      password: 'Foundation-password-123',
    }).expect(200);
    c.csrf = login.body.csrfToken;
    await admin.query("UPDATE sessions SET expire=now()-interval '1 hour'");
    await c.agent.get('/api/v1/auth/me').expect(401);
  });
  it('enforces CSRF token and exact Origin on mutations', async () => {
    const c = await client('csrf');
    await c.agent.post('/api/v1/demo').send({}).expect(403);
    await c.agent
      .post('/api/v1/demo')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', c.csrf)
      .send({})
      .expect(403);
    await post(c, '/demo').expect(201);
  });
  it('returns standardized errors without body contents', async () => {
    const c = await client('errors');
    const r = await post(c, '/workspaces', { name: 'private-test', currency: 'EUR' }).expect(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(r.body.error.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(r.body)).not.toContain('private-test');
    await c.agent.get('/api/v1/unknown').expect(404);
    await post(c, '/workspaces', { name: 'x'.repeat(70000), currency: 'EGP' }).expect(413);
  });
});

describe('tenant isolation and demo restrictions', () => {
  it('refuses to start the API with an administrative database role', async () => {
    await expect(
      createApp(
        readConfig({
          NODE_ENV: 'test',
          APP_ORIGIN: origin,
          DATABASE_URL: 'postgresql://localhost/unused',
          SESSION_SECRET: 'x'.repeat(48),
        }),
        admin,
      ),
    ).rejects.toThrow('UNSAFE_DATABASE_ROLE');
  });
  it('enforces workspace and resource scope through real API and app DB role', async () => {
    const a = await client('tenant-a');
    const b = await client('tenant-b');
    const wa = await company(a);
    const wb = await company(b);
    const draft = (
      await post(a, `/workspaces/${wa}/drafts`, { title: 'Private', assumptions: [] }).expect(201)
    ).body;
    await b.agent.get(`/api/v1/workspaces/${wa}`).expect(404);
    await b.agent.get(`/api/v1/workspaces/${wb}/drafts/${draft.id}`).expect(404);
    await b.agent.get(`/api/v1/workspaces/${wa}/audit`).expect(404);
    expect(
      (await b.agent.get('/api/v1/workspaces')).body.workspaces.map((w: { id: string }) => w.id),
    ).toEqual([wb]);
    const role = (
      await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')
    ).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    expect((await pool.query('SELECT * FROM planning_drafts')).rows).toHaveLength(0);
    expect(
      (await transaction(pool, b.id, wa, async (db) => db.query('SELECT * FROM planning_drafts')))
        .rows,
    ).toHaveLength(0);
  });
  it('isolates personal demos, prevents uploads, and never converts them to company data', async () => {
    const a = await client('demo-a');
    const b = await client('demo-b');
    const da = (await post(a, '/demo').expect(201)).body.id;
    const db = (await post(b, '/demo').expect(201)).body.id;
    expect(da).not.toBe(db);
    expect((await post(a, '/demo').expect(200)).body.id).toBe(da);
    await b.agent.get(`/api/v1/workspaces/${da}`).expect(404);
    await post(a, `/workspaces/${da}/imports`).expect(403);
    await post(a, `/workspaces/${da}/drafts`, { title: 'Real inputs', assumptions: [] }).expect(
      403,
    );
    const companyId = await company(a);
    expect(companyId).not.toBe(da);
    expect((await a.agent.get(`/api/v1/workspaces/${companyId}/drafts`)).body.drafts).toEqual([]);
    expect(
      (await admin.query('SELECT * FROM memberships WHERE workspace_id=$1', [da])).rows,
    ).toEqual([]);
    for (const permission of permissions)
      await a.agent
        .get(`/api/v1/workspaces/${da}/access/${permission}`)
        .expect(acceptedDemo.includes(permission) ? 204 : 403);
  });
});

describe('approved permission matrix through the centralized API authorization path', () => {
  let owner: Client;
  let manager: Client;
  let analyst: Client;
  let w: string;
  beforeAll(async () => {
    owner = await client('owner');
    manager = await client('manager');
    analyst = await client('analyst');
    w = await company(owner);
    await join(owner, manager, w, 'MANAGER');
    await join(owner, analyst, w, 'ANALYST');
  });
  for (const role of ['OWNER', 'MANAGER', 'ANALYST'] as Role[]) {
    for (const permission of permissions)
      it(`${role}: ${permission}`, async () => {
        const c = role === 'OWNER' ? owner : role === 'MANAGER' ? manager : analyst;
        await c.agent
          .get(`/api/v1/workspaces/${w}/access/${permission}`)
          .expect(accepted[role].includes(permission) ? 204 : 403);
      });
  }
  it('denies actual administrative mutations to non-owners', async () => {
    await patch(manager, `/workspaces/${w}`, { name: 'Unauthorized', revision: 1 }).expect(403);
    await post(analyst, `/workspaces/${w}/invitations`, {
      email: 'x@example.test',
      role: 'MANAGER',
    }).expect(403);
    await post(manager, `/workspaces/${w}/imports`).expect(403);
    await post(analyst, `/workspaces/${w}/imports`).expect(400);
  });
  it('protects last owner and requires explicit ownership transfer', async () => {
    await expect(
      admin.query('DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2', [w, owner.id]),
    ).rejects.toThrow('LAST_OWNER');
    await del(owner, `/workspaces/${w}/members/${owner.id}`)
      .expect(409)
      .expect((r) => expect(r.body.error.code).toBe('LAST_OWNER'));
    await patch(owner, `/workspaces/${w}/members/${owner.id}`, { role: 'ANALYST' }).expect(409);
    await post(owner, `/workspaces/${w}/ownership-transfer`, { targetUserId: manager.id }).expect(
      204,
    );
    await owner.agent.get(`/api/v1/workspaces/${w}/access/members.manage`).expect(403);
    await manager.agent.get(`/api/v1/workspaces/${w}/access/members.manage`).expect(204);
    expect(
      Number(
        (
          await admin.query(
            "SELECT count(*) FROM memberships WHERE workspace_id=$1 AND role='OWNER'",
            [w],
          )
        ).rows[0].count,
      ),
    ).toBe(1);
  });
  it('revokes access immediately in an existing session', async () => {
    await del(manager, `/workspaces/${w}/members/${analyst.id}`).expect(204);
    await analyst.agent.get(`/api/v1/workspaces/${w}`).expect(404);
  });
});

describe('versions, concurrency, invitations and audit', () => {
  it('preserves confirmed snapshots after draft changes and rejects stale edits', async () => {
    const c = await client('versions');
    const w = await company(c);
    const input = {
      title: 'Hiring assumption',
      assumptions: [
        {
          key: 'employee_cost',
          value: '12500.50',
          currency: 'EGP',
          explanation: 'Explicit planning estimate',
        },
      ],
    };
    const draft = (await post(c, `/workspaces/${w}/drafts`, input).expect(201)).body;
    const first = (
      await post(c, `/workspaces/${w}/drafts/${draft.id}/confirm`, { revision: 1 }).expect(201)
    ).body.id;
    expect(
      (await post(c, `/workspaces/${w}/drafts/${draft.id}/confirm`, { revision: 1 })).body.id,
    ).toBe(first);
    const outcomes = await Promise.all([
      patch(c, `/workspaces/${w}/drafts/${draft.id}`, {
        revision: 1,
        payload: { ...input, title: 'Changed' },
      }),
      patch(c, `/workspaces/${w}/drafts/${draft.id}`, {
        revision: 1,
        payload: { ...input, title: 'Concurrent' },
      }),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await c.agent.get(`/api/v1/workspaces/${w}/versions/${first}`)).body.payload).toEqual(
      input,
    );
    const second = (
      await post(c, `/workspaces/${w}/drafts/${draft.id}/confirm`, { revision: 2 }).expect(201)
    ).body.id;
    expect(second).not.toBe(first);
    await expect(
      admin.query('UPDATE assumption_versions SET payload=$1 WHERE id=$2', [{}, first]),
    ).rejects.toThrow('IMMUTABLE_VERSION');
    await expect(
      transaction(pool, c.id, w, (db) =>
        db.query('DELETE FROM assumption_versions WHERE id=$1', [first]),
      ),
    ).rejects.toThrow();
    const events = (await c.agent.get(`/api/v1/workspaces/${w}/audit`).expect(200)).body.events;
    expect(events.some((e: { action: string }) => e.action === 'assumption.confirmed')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('12500.50');
  });
  it('blocks incompatible currency and optimistic workspace updates', async () => {
    const c = await client('currency');
    const w = await company(c);
    await post(c, `/workspaces/${w}/drafts`, {
      title: 'Mismatch',
      assumptions: [{ key: 'cost', value: '1.00', currency: 'USD', explanation: 'Unknown FX' }],
    }).expect(422);
    await patch(c, `/workspaces/${w}`, { name: 'New', revision: 1 }).expect(200);
    await patch(c, `/workspaces/${w}`, { name: 'Stale', revision: 1 }).expect(409);
    await post(c, `/workspaces/${w}/archive`).expect(204);
    await post(c, `/workspaces/${w}/drafts`, { title: 'Blocked', assumptions: [] }).expect(409);
  });
  it('requires matching email, unexpired invitation, and rejects token reuse', async () => {
    const owner = await client('invite-owner');
    const target = await client('invite-target');
    const stranger = await client('invite-stranger');
    const w = await company(owner);
    const token = (
      await post(owner, `/workspaces/${w}/invitations`, {
        email: target.email,
        role: 'ANALYST',
      }).expect(201)
    ).body.token;
    await post(stranger, '/invitations/accept', { token }).expect(400);
    await post(target, '/invitations/accept', { token }).expect(200);
    await post(target, '/invitations/accept', { token }).expect(400);
    const expired = (
      await post(owner, `/workspaces/${w}/invitations`, { email: stranger.email, role: 'MANAGER' })
    ).body;
    await admin.query("UPDATE invitations SET expires_at=now()-interval '1 hour' WHERE id=$1", [
      expired.id,
    ]);
    await post(stranger, '/invitations/accept', { token: expired.token }).expect(400);
  });
  it('has clean migrations and exact numeric support', async () => {
    expect(
      (await admin.query('SELECT name FROM schema_migrations ORDER BY name')).rows,
    ).toHaveLength(10);
    expect(
      (await pool.query("SELECT '0.1'::numeric(24,6)+'0.2'::numeric(24,6) AS total")).rows[0].total,
    ).toBe('0.300000');
  });
});

describe('M2 persisted baseline workflow and tenant security',()=>{
 let owner:Client,analyst:Client,manager:Client,other:Client,w:string,w2:string,base:string,draftId:string,versionId:string,baselineId:string,runId:string;
 beforeAll(async()=>{
  // Independent app instance avoids sharing M1's request-rate counters.
  app=await createApp(readConfig({NODE_ENV:'test',APP_ORIGIN:origin,DATABASE_URL:'postgresql://unused:unused@localhost/unused',SESSION_SECRET:randomBytes(48).toString('hex')}),pool);
  owner=await client('m2-owner');analyst=await client('m2-analyst');manager=await client('m2-manager');other=await client('m2-outsider');w=await company(owner);w2=await company(other);base=`/workspaces/${w}/planning`;await join(owner,analyst,w,'ANALYST');await join(owner,manager,w,'MANAGER');
 });
 it('allows Analyst input and confirmation; normalizes money and preserves dated schedules',async()=>{
  const d=syntheticFixture('new-company');draftId=(await post(analyst,base+'/drafts',d).expect(201)).body.id;
  const report=(await analyst.agent.get('/api/v1'+base+`/drafts/${draftId}/capabilities`).expect(200)).body;expect(report.executable).toBe(true);
  versionId=(await post(analyst,base+`/drafts/${draftId}/confirm`,{revision:1}).expect(201)).body.id;
  const version=(await owner.agent.get('/api/v1'+base+`/versions/${versionId}`).expect(200)).body;expect(version.document.entries[2].date).toBe('2026-01-10');expect(version.document.entries[2].driver.amount).toBe('18000.000000');expect(version.suppliedBy[version.document.entries[0].id]).toBe(analyst.id);
 });
 it('Manager cannot supply or replace raw data; can revise confirmed assumptions',async()=>{
  await post(manager,base+'/drafts',syntheticFixture('service')).expect(403);
  const current=(await manager.agent.get('/api/v1'+base+`/drafts/${draftId}`)).body;
  const changed=structuredClone(current.document);changed.entries[2].driver.amount='19000';
  await patch(manager,base+`/drafts/${draftId}`,{revision:1,document:changed}).expect(403);
  current.document.entries[0].driver.amount='13000';await patch(manager,base+`/drafts/${draftId}`,{revision:1,document:current.document}).expect(200);
  await post(manager,base+`/drafts/${draftId}/confirm`,{revision:2}).expect(201);
 });
 it('reserve policy is Owner-only and revision checked',async()=>{
  for(const c of [analyst,manager])await post(c,base+'/reserve',{minimum:'5000',note:'Declared minimum',expectedRevision:0}).expect(403);
  await post(owner,base+'/reserve',{minimum:'5000',note:'Declared minimum',expectedRevision:0}).expect(201);
  await post(owner,base+'/reserve',{minimum:'5000',note:'Stale change',expectedRevision:0}).expect(409);
 });
 it('Analyst prepares and executes; Manager publishes; Analyst cannot publish',async()=>{
  baselineId=(await post(analyst,base+'/baselines',{planningVersionId:versionId}).expect(201)).body.id;
  await post(analyst,base+`/baselines/${baselineId}/publish`).expect(403);
  await post(manager,base+`/baselines/${baselineId}/publish`).expect(200);
  runId=(await post(analyst,base+`/baselines/${baselineId}/runs`,{idempotencyKey:'golden-first'}).expect(201)).body.id;
  const r=(await owner.agent.get('/api/v1'+base+`/runs/${runId}`).expect(200)).body.result;
  expect(r.periods.map((p:{closingCash:string})=>p.closingCash)).toEqual(['9000.00','6000.00','3000.00']);expect(r.fundingGap).toBe('2000.00');expect(r.firstReserveBreach).toBe('2026-03');
 });
 it('replays normalized persisted input and is idempotent',async()=>{
  expect((await post(owner,base+`/runs/${runId}/replay`).expect(200)).body.matches).toBe(true);
  expect((await post(owner,base+`/baselines/${baselineId}/runs`,{idempotencyKey:'golden-first'}).expect(201)).body.id).toBe(runId);
 });
 it('draft changes and later policy changes cannot alter completed or repeated old baseline results',async()=>{
  const before=(await owner.agent.get('/api/v1'+base+`/runs/${runId}`)).body.result;
  const draft=(await owner.agent.get('/api/v1'+base+`/drafts/${draftId}`)).body;draft.document.entries[0].driver.amount='99999';
  await patch(owner,base+`/drafts/${draftId}`,{revision:2,document:draft.document}).expect(200);
  await post(owner,base+'/reserve',{minimum:'20000',note:'New future policy',expectedRevision:1}).expect(201);
  const again=(await post(owner,base+`/baselines/${baselineId}/runs`,{idempotencyKey:'old-baseline-new-run'}).expect(201)).body.id;
  const after=(await owner.agent.get('/api/v1'+base+`/runs/${again}`)).body.result;
  expect(after.periods).toEqual(before.periods);expect(after.fundingGap).toBe('2000.00');expect((await owner.agent.get('/api/v1'+base+`/runs/${runId}`)).body.result).toEqual(before);
 });
 it.each(['draft','draft-capabilities','version','version-capabilities','baseline','run','evidence'])('rejects guessed cross-workspace %s identifiers',async(kind)=>{
  const suffix:Record<string,string>={draft:`/drafts/${draftId}`,'draft-capabilities':`/drafts/${draftId}/capabilities`,version:`/versions/${versionId}`,'version-capabilities':`/versions/${versionId}/capabilities`,baseline:`/baselines/${baselineId}`,run:`/runs/${runId}`,evidence:`/runs/${runId}/evidence`};
  await other.agent.get('/api/v1'+base+suffix[kind]).expect(404);
  await other.agent.get(`/api/v1/workspaces/${w2}/planning`+suffix[kind]).expect(404);
 });
 it('cross-workspace mutation and replay stay blocked',async()=>{
  const foreign=`/workspaces/${w2}/planning`;
  await post(other,foreign+'/baselines',{planningVersionId:versionId}).expect(404);
  await post(other,foreign+`/drafts/${draftId}/confirm`,{revision:3}).expect(404);
  await post(other,foreign+`/baselines/${baselineId}/publish`).expect(404);
  await post(other,foreign+`/baselines/${baselineId}/runs`,{idempotencyKey:'foreign'}).expect(404);
  await post(other,foreign+`/runs/${runId}/replay`).expect(404);
 });
 it('all new business tables are RLS-protected with no context and another tenant context',async()=>{
  for(const table of ['financial_drafts','planning_versions','planning_entries','reserve_policy_versions','baseline_versions','baseline_publications','baseline_runs','baseline_period_results','baseline_movements']){
   expect((await pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
   await transaction(pool,other.id,w2,async db=>expect((await db.query(`SELECT * FROM ${table} WHERE workspace_id=$1`,[w])).rows).toHaveLength(0));
  }
 });
 it('immutable version and result tables reject administrative updates',async()=>{
  for(const [table,column,value] of [['planning_versions','id',versionId],['planning_entries','planning_version_id',versionId],['baseline_versions','id',baselineId],['baseline_runs','id',runId],['baseline_period_results','run_id',runId],['baseline_movements','run_id',runId]])await expect(admin.query(`UPDATE ${table} SET workspace_id=workspace_id WHERE ${column}=$1`,[value])).rejects.toThrow();
 });
 it('composite foreign key rejects a baseline linking another tenant version',async()=>{
  await expect(admin.query('INSERT INTO baseline_versions(id,workspace_id,planning_version_id,created_by) VALUES($1,$2,$3,$4)',[randomUUID(),w2,versionId,other.id])).rejects.toThrow();
 });
 it('returns financial explanations for missing cash and refuses confirmation',async()=>{
  const d=syntheticFixture('service');d.openingCash=null;
  const id=(await post(owner,base+'/drafts',d).expect(201)).body.id;
  const response=await post(owner,base+`/drafts/${id}/confirm`,{revision:1}).expect(422);
  expect(response.body.error.details.capabilities[1].findings.some((f:{code:string})=>f.code==='OPENING_CASH_REQUIRED')).toBe(true);
 });
 it('audit contains action and version identity without raw monetary payloads',async()=>{
  const rows=(await admin.query('SELECT action,metadata FROM audit_events WHERE workspace_id=$1',[w])).rows;
  for(const action of ['planning.confirmed','schedule.confirmed','assumption.confirmed','baseline.published','baseline.run_completed','risk_policy.changed'])expect(rows.some(r=>r.action===action)).toBe(true);
  expect(JSON.stringify(rows)).not.toContain('18000');
 });
 it('Demo accepts only enumerated synthetic fixtures and blocks real drafts',async()=>{
  const demo=(await post(owner,'/demo').expect(201)).body.id;const path=`/workspaces/${demo}/planning`;
  await post(owner,path+'/drafts',syntheticFixture('service')).expect(403);
  await post(owner,path+'/demo-fixture',{profile:'service',document:syntheticFixture('service')}).expect(400);
  for(const profile of ['service','retail','new-company']){const id=(await post(owner,path+'/demo-fixture',{profile}).expect(200)).body.id;expect((await post(owner,path+`/runs/${id}/replay`).expect(200)).body.matches).toBe(true);}
 });
});

describe('M4 import persistence, integration and isolation',()=>{
 let owner:Client,analyst:Client,manager:Client,other:Client,w:string,w2:string,path:string,fileId:string,draftId:string,mappingId:string,datasetId:string,templateId:string,baselineId:string,baselineRun:string,scenarioRun:string,m:Mapping;
 const upload=async(c:Client,name:string,bytes?:Buffer)=>c.agent.post('/api/v1'+path).set('Origin',origin).set('X-CSRF-Token',c.csrf).set('Content-Type','application/octet-stream').set('X-File-Name',encodeURIComponent(name)).send(bytes??await fixtureBytes(name));
 beforeAll(async()=>{app=await createApp(readConfig({NODE_ENV:'test',APP_ORIGIN:origin,DATABASE_URL:'postgresql://unused:unused@localhost/unused',SESSION_SECRET:randomBytes(48).toString('hex')}),pool);owner=await client('m4-owner');analyst=await client('m4-analyst');manager=await client('m4-manager');other=await client('m4-other');w=await company(owner);w2=await company(other);path=`/workspaces/${w}/imports`;await join(owner,analyst,w,'ANALYST');await join(owner,manager,w,'MANAGER');m=reviewed(await fixtureRaw('01-clean-service.xlsx'));});
 it('Owner/Analyst may upload; Manager and outsiders cannot',async()=>{expect((await upload(manager,'01-clean-service.xlsx')).status).toBe(403);expect((await upload(other,'01-clean-service.xlsx')).status).toBe(404);const r=await upload(analyst,'01-clean-service.xlsx');expect(r.status).toBe(201);expect(r.body.status).toBe('parsed');fileId=r.body.id;});
 it('stores provenance, exact tenant-private original and structural preview',async()=>{const f=(await owner.agent.get('/api/v1'+path+'/'+fileId).expect(200)).body;expect(f.uploaded_by).toBe(analyst.id);expect(f.file_hash).toMatch(/^[a-f0-9]{64}$/);expect(f.sheets[0].name).toBe('Service');expect(f.raw).toBeUndefined();const b=await manager.agent.get('/api/v1'+path+`/${fileId}/original`).expect(200);expect(b.body).toEqual(await fixtureBytes('01-clean-service.xlsx'));expect(b.headers['content-disposition']).toContain('attachment');const preview=(await owner.agent.get('/api/v1'+path+`/${fileId}/preview?sheet=Service&headerRow=1`).expect(200)).body;expect(preview.suggestions[1].reason).toContain('Sales could mean');});
 it('requires column review and explicit human mapping confirmation',async()=>{draftId=(await post(analyst,path+`/${fileId}/select-sheet`,{sheet:'Service',headerRow:1}).expect(201)).body.id;await post(analyst,path+`/mappings/${draftId}/confirm`,{revision:1,reviewed:true}).expect(422);await post(analyst,path+`/mappings/${draftId}/confirm`,{revision:1,reviewed:false}).expect(400);expect((await post(analyst,path+`/mappings/${draftId}/validate`).expect(200)).body.canConfirm).toBe(false);});
 it('revision-checks edits and enforces Manager read-only mapping',async()=>{await patch(manager,path+`/mappings/${draftId}`,{revision:1,mapping:m}).expect(403);await patch(analyst,path+`/mappings/${draftId}`,{revision:1,mapping:m}).expect(200);await patch(analyst,path+`/mappings/${draftId}`,{revision:1,mapping:m}).expect(409);mappingId=(await post(analyst,path+`/mappings/${draftId}/confirm`,{revision:2,reviewed:true}).expect(201)).body.id;expect((await post(owner,path+`/mappings/${draftId}/confirm`,{revision:2,reviewed:true}).expect(201)).body.id).toBe(mappingId);});
 it('validates and confirms an immutable dataset via existing M2 confirmation',async()=>{expect((await post(owner,path+`/mapping-versions/${mappingId}/validate`).expect(200)).body.canConfirm).toBe(true);await post(manager,path+`/mapping-versions/${mappingId}/dataset`,{confirmed:true,acceptedWarnings:[]}).expect(403);const r=await post(analyst,path+`/mapping-versions/${mappingId}/dataset`,{confirmed:true,acceptedWarnings:[]}).expect(201);datasetId=r.body.id;const d=(await manager.agent.get('/api/v1'+path+`/datasets/${datasetId}`).expect(200)).body;expect(d.mapping_version_id).toBe(mappingId);expect(d.confirmed_by).toBe(analyst.id);expect(d.lineage.length).toBeGreaterThan(18);const v=(await owner.agent.get(`/api/v1/workspaces/${w}/planning/versions/${r.body.planningVersionId}`).expect(200)).body;expect(v.document).toEqual(d.normalized_document);expect((await post(owner,path+`/datasets/${datasetId}/replay`).expect(200)).body.matches).toBe(true);});
 it('dataset confirmation is idempotent and cannot duplicate normalized records',async()=>{expect((await post(owner,path+`/mapping-versions/${mappingId}/dataset`,{confirmed:true,acceptedWarnings:[]}).expect(201)).body.id).toBe(datasetId);expect((await owner.agent.get('/api/v1'+path+'/datasets')).body.datasets).toHaveLength(1);});
 it('imported dataset feeds published M2 baseline and M3 sales scenario',async()=>{const d=(await owner.agent.get('/api/v1'+path+`/datasets/${datasetId}`)).body,p=`/workspaces/${w}/planning`,s=`/workspaces/${w}/scenarios`;baselineId=(await post(manager,p+'/baselines',{planningVersionId:d.planning_version_id}).expect(201)).body.id;await post(manager,p+`/baselines/${baselineId}/publish`).expect(200);baselineRun=(await post(owner,p+`/baselines/${baselineId}/runs`,{idempotencyKey:'import-baseline'}).expect(201)).body.id;const b=(await owner.agent.get('/api/v1'+s+`/baselines/${baselineId}/inputs`).expect(200)).body;const r=(await owner.agent.get('/api/v1'+p+`/runs/${baselineRun}`)).body.result;expect(r.periods.map((x:{closingCash:string})=>x.closingCash)).toEqual(['1500.00','2100.00','2800.00']);const sd=(await post(manager,s+'/drafts',syntheticScenario('sales',b)).expect(201)).body.id;const sv=(await post(manager,s+`/drafts/${sd}/confirm`,{revision:1,assumptionsConfirmed:true}).expect(201)).body.id;scenarioRun=(await post(manager,s+`/versions/${sv}/runs`,{idempotencyKey:'import-scenario'}).expect(201)).body.id;expect((await post(owner,s+`/runs/${scenarioRun}/replay`).expect(200)).body.matches).toBe(true);});
 it('creates and versions workspace templates only from confirmed data',async()=>{templateId=(await post(analyst,path+'/templates',{mappingVersionId:mappingId,name:'Service import'}).expect(201)).body.id;expect((await post(owner,path+'/templates',{mappingVersionId:mappingId,name:'Service import'}).expect(201)).body.version).toBe(2);await post(manager,path+'/templates',{mappingVersionId:mappingId,name:'Denied'}).expect(403);});
 it('compatible template proposes mapping but clears confirmations and source choices',async()=>{const f=(await upload(owner,'19-template-compatible.xlsx')).body.id;const draft=(await post(owner,path+`/${f}/select-sheet`,{sheet:'Service',headerRow:1}).expect(201)).body.id;const r=(await post(owner,path+`/mappings/${draft}/template`,{templateId,revision:1,reviewBeforeConfirmation:true}).expect(200)).body;expect(r.mapping.rules.every((x:{semanticConfirmed:boolean})=>!x.semanticConfirmed)).toBe(true);expect(r.mapping.coverageReviewed).toBe(false);expect(r.mapping.opening).toBeNull();expect(r.mapping.sourceResolution.mode).toBeNull();await post(owner,path+`/mappings/${draft}/confirm`,{revision:2,reviewed:true}).expect(422);});
 it('changed structure cannot silently reuse a template',async()=>{const f=(await upload(owner,'20-template-changed.csv')).body.id,d=(await post(owner,path+`/${f}/select-sheet`,{sheet:'CSV',headerRow:1}).expect(201)).body.id;expect((await post(owner,path+`/mappings/${d}/template`,{templateId,revision:1,reviewBeforeConfirmation:true}).expect(422)).body.error.code).toBe('TEMPLATE_STRUCTURE_MISMATCH');});
 it('new file/new dataset requires current overlap warnings and preserves historical baseline/scenario',async()=>{const p=`/workspaces/${w}/planning`,s=`/workspaces/${w}/scenarios`,before=(await owner.agent.get('/api/v1'+s+`/runs/${scenarioRun}`)).body;const f=(await upload(owner,'19-template-compatible.xlsx')).body.id,d=(await post(owner,path+`/${f}/select-sheet`,{sheet:'Service',headerRow:1}).expect(201)).body.id;await patch(owner,path+`/mappings/${d}`,{revision:1,mapping:reviewed(await fixtureRaw('19-template-compatible.xlsx'))}).expect(200);const v=(await post(owner,path+`/mappings/${d}/confirm`,{revision:2,reviewed:true}).expect(201)).body.id;await post(owner,path+`/mapping-versions/${v}/dataset`,{confirmed:true,acceptedWarnings:[]}).expect(422);const after=(await post(owner,path+`/mapping-versions/${v}/dataset`,{confirmed:true,acceptedWarnings:['EXISTING_OVERLAP']}).expect(201)).body;expect(after.id).not.toBe(datasetId);expect((await post(owner,path+`/datasets/${datasetId}/replay`).expect(200)).body.matches).toBe(true);expect((await post(owner,p+`/runs/${baselineRun}/replay`).expect(200)).body.matches).toBe(true);expect((await owner.agent.get('/api/v1'+s+`/runs/${scenarioRun}`)).body).toEqual(before);expect((await post(owner,s+`/runs/${scenarioRun}/replay`).expect(200)).body.matches).toBe(true);});
 it('CSV workflow requires acknowledging structural warnings',async()=>{const f=(await upload(analyst,'17-no-opening.csv')).body.id,d=(await post(analyst,path+`/${f}/select-sheet`,{sheet:'CSV',headerRow:1}).expect(201)).body.id;await patch(analyst,path+`/mappings/${d}`,{revision:1,mapping:reviewed(await fixtureRaw('17-no-opening.csv'))}).expect(200);const v=(await post(analyst,path+`/mappings/${d}/confirm`,{revision:2,reviewed:true}).expect(201)).body.id;const report=(await post(analyst,path+`/mapping-versions/${v}/validate`).expect(200)).body;await post(analyst,path+`/mapping-versions/${v}/dataset`,{confirmed:true,acceptedWarnings:[]}).expect(422);await post(analyst,path+`/mapping-versions/${v}/dataset`,{confirmed:true,acceptedWarnings:report.issues.filter((i:{severity:string})=>i.severity==='warning').map((i:{code:string})=>i.code)}).expect(201);});
 it('retains failed parsing status without creating financial data',async()=>{for(const name of ['21-malformed.csv','22-row-limit.csv']){const r=await upload(owner,name);expect(r.body.status).toBe('failed');await post(owner,path+`/${r.body.id}/select-sheet`,{sheet:'CSV',headerRow:1}).expect(422);}const bad=await upload(owner,'suspicious.xlsx',zip([['xl/vbaProject.bin','unsafe']]));expect(bad.body.error).toBe('ACTIVE_CONTENT');});
 it('cancelled imports cannot be edited or confirmed; cancellation is audited',async()=>{const f=(await upload(owner,'17-no-opening.csv')).body.id;await post(owner,path+`/${f}/cancel`).expect(200);await post(owner,path+`/${f}/select-sheet`,{sheet:'CSV',headerRow:1}).expect(409);});
 it.each(['file','original','preview','mapping','mapping-version','dataset'])('isolates %s in both workspace URL contexts',async kind=>{const suffix:Record<string,string>={file:`/${fileId}`,original:`/${fileId}/original`,preview:`/${fileId}/preview?sheet=Service`,mapping:`/mappings/${draftId}`,'mapping-version':`/mapping-versions/${mappingId}`,dataset:`/datasets/${datasetId}`};await other.agent.get('/api/v1'+path+suffix[kind]).expect(404);await other.agent.get(`/api/v1/workspaces/${w2}/imports`+suffix[kind]).expect(404);});
 it('isolates mutations, replay and template selection',async()=>{const foreign=`/workspaces/${w2}/imports`;await post(other,foreign+`/datasets/${datasetId}/replay`).expect(404);await post(other,foreign+`/mapping-versions/${mappingId}/dataset`,{confirmed:true,acceptedWarnings:[]}).expect(404);await post(other,foreign+'/templates',{mappingVersionId:mappingId,name:'stolen'}).expect(404);});
 it('RLS hides all import tables without context and from other tenants',async()=>{for(const table of ['import_files','import_mapping_drafts','import_mapping_versions','import_datasets','import_mapping_templates','import_cancellations']){expect((await pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);await transaction(pool,other.id,w2,async db=>expect((await db.query(`SELECT * FROM ${table} WHERE workspace_id=$1`,[w])).rows).toHaveLength(0));}});
 it('database enforces immutable original/mapping/dataset/template content',async()=>{for(const [table,key,id]of [['import_files','id',fileId],['import_mapping_versions','id',mappingId],['import_datasets','id',datasetId],['import_mapping_templates','id',templateId],['import_cancellations','workspace_id',w]])await expect(admin.query(`UPDATE ${table} SET workspace_id=workspace_id WHERE ${key}=$1`,[id])).rejects.toThrow('IMMUTABLE_VERSION');});
 it('database rejects cross-tenant import references',async()=>{await expect(admin.query('INSERT INTO import_mapping_drafts(id,workspace_id,import_id,mapping,updated_by) VALUES($1,$2,$3,$4,$5)',[randomUUID(),w2,fileId,m,other.id])).rejects.toThrow();});
 it('audit covers successful, failed and rejected import operations without raw financial data',async()=>{const rows=(await admin.query("SELECT action,metadata FROM audit_events WHERE workspace_id=$1 AND action LIKE 'import.%'",[w])).rows;for(const action of ['uploaded','parsing_completed','parsing_failed','sheet_selected','mapping_suggested','mapping_edited','mapping_confirmed','validation_performed','warning_accepted','dataset_confirmed','source_selection_confirmed','template_created','template_versioned','template_proposed','cancelled','request_rejected'])expect(rows.some(r=>r.action==='import.'+action),action).toBe(true);expect(JSON.stringify(rows)).not.toContain('Payroll');expect(JSON.stringify(rows)).not.toContain('rawValue');});
 it('anonymous upload is rejected; Demo does not accept company files',async()=>{await request(app).get('/api/v1'+path).expect(401);const d=(await post(owner,'/demo').expect(201)).body.id;await post(owner,`/workspaces/${d}/imports`).expect(403);});
});

describe('M3 scenario API persistence and security',()=>{
 let owner:Client,manager:Client,analyst:Client,other:Client,w:string,w2:string,path:string,planning:string,baselineId:string,baseline2:string,draftId:string,versionId:string,runId:string,compareId:string,b:BaselineSnapshot,document:ScenarioDocument;
 beforeAll(async()=>{app=await createApp(readConfig({NODE_ENV:'test',APP_ORIGIN:origin,DATABASE_URL:'postgresql://unused:unused@localhost/unused',SESSION_SECRET:randomBytes(48).toString('hex')}),pool);owner=await client('m3-owner');manager=await client('m3-manager');analyst=await client('m3-analyst');other=await client('m3-other');w=await company(owner);w2=await company(other);path=`/workspaces/${w}/scenarios`;planning=`/workspaces/${w}/planning`;await join(owner,manager,w,'MANAGER');await join(owner,analyst,w,'ANALYST');
  const d=(await post(owner,planning+'/drafts',syntheticFixture('service')).expect(201)).body.id;const v=(await post(owner,planning+`/drafts/${d}/confirm`,{revision:1}).expect(201)).body.id;baselineId=(await post(owner,planning+'/baselines',{planningVersionId:v}).expect(201)).body.id;baseline2=(await post(owner,planning+'/baselines',{planningVersionId:v}).expect(201)).body.id;await post(owner,planning+`/baselines/${baselineId}/publish`).expect(200);b=(await owner.agent.get('/api/v1'+path+`/baselines/${baselineId}/inputs`).expect(200)).body;document=syntheticScenario('sales',b);
 });
 it('requires a published baseline',async()=>{await post(owner,path+'/drafts',{...document,baselineVersionId:baseline2}).expect(409);await post(owner,planning+`/baselines/${baseline2}/publish`).expect(200);});
 it('Manager creates, validates and confirms assumptions without raw-data privileges',async()=>{draftId=(await post(manager,path+'/drafts',document).expect(201)).body.id;expect((await manager.agent.get('/api/v1'+path+`/drafts/${draftId}/readiness`).expect(200)).body.readiness).toBe('ready');await post(manager,path+`/drafts/${draftId}/confirm`,{revision:1,assumptionsConfirmed:false}).expect(400);versionId=(await post(manager,path+`/drafts/${draftId}/confirm`,{revision:1,assumptionsConfirmed:true}).expect(201)).body.id;});
 it('Analyst executes a confirmed version with source and actor attribution',async()=>{runId=(await post(analyst,path+`/versions/${versionId}/runs`,{idempotencyKey:'scenario-first'}).expect(201)).body.id;const r=(await owner.agent.get('/api/v1'+path+`/runs/${runId}`).expect(200)).body.result;expect(r.manifest.confirmedBy).toBe(manager.id);expect(r.manifest.actorId).toBe(analyst.id);expect(r.manifest.baselineVersionId).toBe(baselineId);expect(r.scenario.periods.map((p:{closingCash:string})=>p.closingCash)).toEqual(['28000.00','38000.00','48000.00']);expect(r.comparison.periods[1].metrics.closingCash.difference).toBe('-8000.00');});
 it('idempotency returns same run, including concurrent retry',async()=>{const results=await Promise.all([post(owner,path+`/versions/${versionId}/runs`,{idempotencyKey:'scenario-first'}),post(manager,path+`/versions/${versionId}/runs`,{idempotencyKey:'scenario-first'})]);expect(results.map(r=>r.status)).toEqual([201,201]);expect(results.every(r=>r.body.id===runId)).toBe(true);});
 it('stored snapshot replays exactly through the same Financial Engine',async()=>{expect((await post(owner,path+`/runs/${runId}/replay`).expect(200)).body.matches).toBe(true);});
 it('immutable history survives edited draft, new version and new baseline selection',async()=>{const original=(await owner.agent.get('/api/v1'+path+`/runs/${runId}`)).body;const changed=structuredClone(document);if(changed.changes[0].primitive.kind==='adjust')changed.changes[0].primitive.value='0.1';changed.baselineVersionId=baseline2;await patch(manager,path+`/drafts/${draftId}`,{revision:1,document:changed}).expect(200);await patch(manager,path+`/drafts/${draftId}`,{revision:1,document:changed}).expect(409);const v=(await post(manager,path+`/drafts/${draftId}/confirm`,{revision:2,assumptionsConfirmed:true}).expect(201)).body.id;expect(v).not.toBe(versionId);await post(owner,path+`/versions/${v}/runs`,{idempotencyKey:'scenario-first'}).expect(409);await post(owner,path+`/versions/${v}/runs`,{idempotencyKey:'new-version'}).expect(201);expect((await owner.agent.get('/api/v1'+path+`/runs/${runId}`)).body).toEqual(original);expect((await post(owner,path+`/runs/${runId}/replay`).expect(200)).body.matches).toBe(true);});
 it.each(['hiring','spending','expansion','combined'] as const)('persists and replays %s through the actual API',async(type)=>{const d=(await post(analyst,path+'/drafts',syntheticScenario(type,b)).expect(201)).body.id;const v=(await post(analyst,path+`/drafts/${d}/confirm`,{revision:1,assumptionsConfirmed:true}).expect(201)).body.id;const r=(await post(manager,path+`/versions/${v}/runs`,{idempotencyKey:type}).expect(201)).body.id;expect((await post(owner,path+`/runs/${r}/replay`).expect(200)).body.matches).toBe(true);});
 it('saves and reopens A/B/C comparison with a single compatible baseline',async()=>{const runs=(await owner.agent.get('/api/v1'+path+'/runs')).body.runs.filter((r:{baseline_version_id:string})=>r.baseline_version_id===baselineId).slice(0,3);compareId=(await post(manager,path+'/comparisons',{title:'Three alternatives',runIds:runs.map((r:{id:string})=>r.id)}).expect(201)).body.id;const comparison=(await analyst.agent.get('/api/v1'+path+`/comparisons/${compareId}`).expect(200)).body;expect(comparison.runs).toHaveLength(3);expect(comparison.baselineVersionId).toBe(baselineId);});
 it('rejects incompatible baselines, duplicate runs and oversized comparisons',async()=>{const runs=(await owner.agent.get('/api/v1'+path+'/runs')).body.runs;const incompatible=runs.find((r:{baseline_version_id:string})=>r.baseline_version_id===baseline2);await post(owner,path+'/comparisons',{title:'Invalid',runIds:[runId,incompatible.id]}).expect(422);await post(owner,path+'/comparisons',{title:'Duplicate',runIds:[runId,runId]}).expect(422);await post(owner,path+'/comparisons',{title:'Too many',runIds:[runId,runId,runId,runId]}).expect(400);});
 it.each(['draft','readiness','version','run','evidence','comparison','baseline-inputs'])('rejects guessed %s in both tenant URL contexts',async(kind)=>{const suffix:Record<string,string>={draft:`/drafts/${draftId}`,readiness:`/drafts/${draftId}/readiness`,version:`/versions/${versionId}`,run:`/runs/${runId}`,evidence:`/runs/${runId}/evidence`,comparison:`/comparisons/${compareId}`,'baseline-inputs':`/baselines/${baselineId}/inputs`};await other.agent.get('/api/v1'+path+suffix[kind]).expect(404);await other.agent.get(`/api/v1/workspaces/${w2}/scenarios`+suffix[kind]).expect(404);});
 it('blocks foreign baseline, run, comparison and mutation inputs',async()=>{const foreign=`/workspaces/${w2}/scenarios`;await post(other,foreign+'/drafts',document).expect(404);await patch(other,foreign+`/drafts/${draftId}`,{revision:2,document}).expect(404);await post(other,foreign+`/versions/${versionId}/runs`,{idempotencyKey:'foreign'}).expect(404);await post(other,foreign+'/comparisons',{title:'Foreign',runIds:[runId]}).expect(404);await post(other,foreign+`/runs/${runId}/replay`).expect(404);});
 it('does not grant risk policy or membership access to scenario users',async()=>{await post(manager,planning+'/reserve',{minimum:'1000',note:'Not authorized',expectedRevision:0}).expect(403);await post(analyst,`/workspaces/${w}/invitations`,{email:other.email,role:'MANAGER'}).expect(403);});
 it('returns missing employee cost and conflict findings before confirmation',async()=>{const missing=syntheticScenario('hiring',b);const p=missing.changes[0].primitive;if(p.kind==='entry'&&p.entry.driver.kind==='headcount')p.entry.driver.monthlyCost=null;const d=(await post(owner,path+'/drafts',missing).expect(201)).body.id;const failure=await post(owner,path+`/drafts/${d}/confirm`,{revision:1,assumptionsConfirmed:true}).expect(422);expect(failure.body.error.details.readiness).toBe('missing_required_input');const duplicate=structuredClone(document);duplicate.changes.push({...duplicate.changes[0],id:randomUUID()});expect((await post(owner,path+'/validate',duplicate).expect(200)).body.readiness).toBe('invalid_conflicting_input');});
 it('rejects malformed payloads and unsupported fields',async()=>{await post(owner,path+'/drafts',{...document,workspaceId:w2}).expect(400);await post(owner,path+'/drafts',{...document,changes:[{...document.changes[0],id:'bad'}]}).expect(400);await post(owner,path+'/drafts',{...document,currency:'EUR'}).expect(400);});
 it('RLS hides all six new tables without context and from foreign tenants',async()=>{for(const table of ['scenario_drafts','scenario_versions','scenario_runs','scenario_period_results','scenario_comparisons','scenario_comparison_runs']){expect((await pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);await transaction(pool,other.id,w2,async db=>expect((await db.query(`SELECT * FROM ${table} WHERE workspace_id=$1`,[w])).rows).toHaveLength(0));}});
 it('confirmed versions, runs, numeric results and comparisons are immutable',async()=>{for(const [table,column,id]of [['scenario_versions','id',versionId],['scenario_runs','id',runId],['scenario_period_results','run_id',runId],['scenario_comparisons','id',compareId],['scenario_comparison_runs','comparison_id',compareId]])await expect(admin.query(`UPDATE ${table} SET workspace_id=workspace_id WHERE ${column}=$1`,[id])).rejects.toThrow('IMMUTABLE_VERSION');});
 it('composite database foreign keys reject cross-tenant baseline attachment',async()=>{await expect(admin.query('INSERT INTO scenario_drafts(id,workspace_id,baseline_version_id,document,contributors,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)',[randomUUID(),w2,baselineId,document,{},other.id])).rejects.toThrow();});
 it('audit records successful and rejected actions without financial payloads',async()=>{const rows=(await admin.query("SELECT action,actor_id,metadata FROM audit_events WHERE workspace_id=$1 AND action LIKE 'scenario.%'",[w])).rows;for(const action of ['scenario.created','scenario.draft_edited','scenario.assumptions_changed','scenario.confirmed','scenario.versioned','scenario.run_completed','scenario.comparison_created','scenario.request_rejected'])expect(rows.some(r=>r.action===action)).toBe(true);expect(rows.some(r=>r.action==='scenario.confirmed'&&r.actor_id===manager.id)).toBe(true);expect(JSON.stringify(rows)).not.toContain('monthlyCost');});
 it('anonymous scenario requests are unauthorized',async()=>{await request(app).get('/api/v1'+path+'/runs').expect(401);});
 it('Personal Demo executes all five synthetic examples and cannot accept company input',async()=>{const demo=(await post(owner,'/demo').expect(201)).body.id;const demoPath=`/workspaces/${demo}/scenarios`;await post(owner,demoPath+'/drafts',document).expect(403);await post(owner,demoPath+'/demo-examples',{type:'sales',baselineVersionId:baselineId}).expect(400);for(const type of ['sales','hiring','spending','expansion','combined']){const r=(await post(owner,demoPath+'/demo-examples',{type}).expect(200)).body.id;expect((await post(owner,demoPath+`/runs/${r}/replay`).expect(200)).body.matches).toBe(true);await owner.agent.get('/api/v1'+path+`/runs/${r}`).expect(404);}await post(owner,path+'/demo-examples',{type:'sales'}).expect(403);});
});

describe('M5 forecast jobs, immutable artifacts and hybrid baseline integration',()=>{
 let c:Client,stranger:Client,w:string,other:string,ids:string[],templateId:string,jobId:string,artifactId:string,approvalId:string,baselineId:string,runId:string;
 let originalArtifact:unknown;let template:PlanningDocument;
 const req=()=>({planningVersionIds:ids,componentKey:'sales',origin:'2023-01',horizon:3,nature:'variable',structuralChange:false,historyReviewed:true,idempotencyKey:'m5-job'});
 const path=()=>`/workspaces/${w}/forecasts`;
 const confirm=async(d:PlanningDocument)=>{const draft=await post(c,`/workspaces/${w}/planning/drafts`,d).expect(201);return (await post(c,`/workspaces/${w}/planning/drafts/${draft.body.id}/confirm`,{revision:1}).expect(201)).body.id as string;};
 beforeAll(async()=>{c=await client('m5-owner');stranger=await client('m5-stranger');w=await company(c);other=await company(stranger);ids=[];for(const d of forecastDocuments())ids.push(await confirm(d));template=futureTemplate();templateId=await confirm(template);});
 it('reads explicit eligible horizon-matched evidence',async()=>{const r=await post(c,path()+'/eligibility',req()).expect(200);expect(r.body.eligibility.status).toBe('eligible');expect(r.body.eligibility.folds).toHaveLength(3);});
 it('rejects unauthorized historical references without disclosure',async()=>{await post(stranger,`/workspaces/${other}/forecasts/eligibility`,req()).expect(404);});
 it('returns insufficient evidence for longer horizons',async()=>{const r=await post(c,path()+'/eligibility',{...req(),horizon:12}).expect(200);expect(r.body.eligibility.status).toBe('insufficient_evaluation_evidence');});
 it('submits idempotently and detects changed payload',async()=>{const a=await post(c,path()+'/jobs',req()).expect(201),b=await post(c,path()+'/jobs',req()).expect(201);jobId=a.body.id;expect(b.body.id).toBe(jobId);await post(c,path()+'/jobs',{...req(),horizon:6}).expect(409);});
 it('isolates job reads and execution',async()=>{await stranger.agent.get('/api/v1'+path()+'/jobs/'+jobId).expect(404);await post(stranger,`/workspaces/${other}/forecasts/jobs/${jobId}/run`).expect(404);});
 it('executes Python once and persists complete evidence atomically',async()=>{const r=await post(c,path()+`/jobs/${jobId}/run`).expect(200);expect(r.body.status).toBe('succeeded');artifactId=r.body.artifact_id;const again=await post(c,path()+`/jobs/${jobId}/run`).expect(200);expect(again.body.artifact_id).toBe(artifactId);const a=await c.agent.get('/api/v1'+path()+'/artifacts/'+artifactId).expect(200);expect(a.body.result.selectedModel).toBe('holt');expect(a.body.result.candidates).toHaveLength(4);originalArtifact=a.body.result;});
 it('isolates artifacts and approval requests',async()=>{await stranger.agent.get(`/api/v1/workspaces/${other}/forecasts/artifacts/${artifactId}`).expect(404);await post(stranger,`/workspaces/${other}/forecasts/artifacts/${artifactId}/approve`,{reviewed:true}).expect(404);});
 it('requires review and approval is idempotent',async()=>{await post(c,path()+`/artifacts/${artifactId}/approve`,{reviewed:false}).expect(400);const a=await post(c,path()+`/artifacts/${artifactId}/approve`,{reviewed:true}).expect(200);approvalId=a.body.id;expect((await post(c,path()+`/artifacts/${artifactId}/approve`,{reviewed:true})).body.id).toBe(approvalId);});
 const composition=()=>({idempotencyKey:'m5-hybrid',templateVersionId:templateId,artifactId,approvalId,componentKey:'sales',origin:'2023-01',horizon:3,title:'M5 hybrid',mode:'forecast',assumptionValues:[],note:'Reviewed synthetic trend',cashTreatment:{kind:'profile',buckets:[{offsetMonths:0,proportion:'1'}]},category:'revenue',effect:'revenue',replaceEntryIds:[template.entries[0].id],sourcesReviewed:true});
 it('rejects forged forecast money in ordinary M2 confirmation',async()=>{const d=structuredClone(template);d.entries[0]={...d.entries[0],source:'forecast',end:'2023-01',forecastRef:{artifactId,approvalId,period:'2023-01'},driver:{kind:'fixed',amount:'999'}};const draft=await post(c,`/workspaces/${w}/planning/drafts`,d).expect(201);await post(c,`/workspaces/${w}/planning/drafts/${draft.body.id}/confirm`,{revision:1}).expect(422);});
 it('requires explicit replacement rather than double counting',async()=>{await post(c,path()+'/compositions',{...composition(),replaceEntryIds:[]}).expect(422);});
 it('creates a new hybrid baseline with immutable source assignments',async()=>{const r=await post(c,path()+'/compositions',composition()).expect(201);baselineId=r.body.baseline_version_id;expect(r.body.assignments.filter((a:{source:string})=>a.source==='forecast')).toHaveLength(3);expect(r.body.assignments.filter((a:{source:string})=>a.source==='schedule')).toHaveLength(3);const again=await post(c,path()+'/compositions',composition()).expect(201);expect(again.body.baseline_version_id).toBe(baselineId);});
 it('existing engine produces exact cash and replays without Python',async()=>{const r=await post(c,`/workspaces/${w}/planning/baselines/${baselineId}/runs`,{idempotencyKey:'m5-cash'}).expect(201);runId=r.body.id;const result=await c.agent.get(`/api/v1/workspaces/${w}/planning/runs/${runId}`).expect(200);expect(result.body.result.periods.map((p:{closingCash:string})=>p.closingCash)).toEqual(['1122.00','1246.00','1372.00']);expect((await post(c,`/workspaces/${w}/planning/runs/${runId}/replay`).expect(200)).body.matches).toBe(true);});
 it('later confirmed data and new forecasts cannot change older artifacts or baselines',async()=>{await confirm(forecastDocuments(12,()=> '999')[0]);const r=await post(c,path()+'/jobs',{...req(),idempotencyKey:'m5-next'}).expect(201);await post(c,path()+`/jobs/${r.body.id}/run`).expect(200);expect((await c.agent.get('/api/v1'+path()+'/artifacts/'+artifactId)).body.result).toEqual(originalArtifact);expect((await c.agent.get(`/api/v1/workspaces/${w}/planning/versions/${templateId}`)).body.document.entries[0].driver.amount).toBe('100.000000');expect((await post(c,`/workspaces/${w}/planning/runs/${runId}/replay`)).body.matches).toBe(true);});
 it('database rejects artifact mutation and deletion even for owner role',async()=>{await expect(admin.query('UPDATE forecast_artifacts SET result=$1 WHERE id=$2',[{},artifactId])).rejects.toThrow();await expect(admin.query('DELETE FROM forecast_artifacts WHERE id=$1',[artifactId])).rejects.toThrow();});
 it('RLS hides all M5 tables without context and under a different tenant',async()=>{for(const table of ['forecast_jobs','forecast_attempts','forecast_artifacts','forecast_approvals','forecast_compositions']){expect((await pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);await transaction(pool,stranger.id,other,async db=>expect((await db.query(`SELECT * FROM ${table} WHERE workspace_id=$1`,[w])).rows).toHaveLength(0));}});
 it('later M4 import and mapping edits preserve the stored forecast',async()=>{const p=`/workspaces/${w}/imports`;const f=(await c.agent.post('/api/v1'+p).set('Origin',origin).set('X-CSRF-Token',c.csrf).set('Content-Type','application/octet-stream').set('X-File-Name','01-clean-service.xlsx').send(await fixtureBytes('01-clean-service.xlsx')).expect(201)).body.id;const draft=(await post(c,p+`/${f}/select-sheet`,{sheet:'Service',headerRow:1}).expect(201)).body.id;const mapping=reviewed(await fixtureRaw('01-clean-service.xlsx'));await patch(c,p+`/mappings/${draft}`,{revision:1,mapping}).expect(200);const version=(await post(c,p+`/mappings/${draft}/confirm`,{revision:2,reviewed:true}).expect(201)).body.id;await post(c,p+`/mapping-versions/${version}/dataset`,{confirmed:true,acceptedWarnings:[]}).expect(201);await patch(c,p+`/mappings/${draft}`,{revision:2,mapping:{...mapping,title:'Later mapping draft'}}).expect(200);expect((await c.agent.get('/api/v1'+path()+'/artifacts/'+artifactId)).body.result).toEqual(originalArtifact);expect((await post(c,`/workspaces/${w}/planning/runs/${runId}/replay`)).body.matches).toBe(true);});
 it('M3 scenario calculations accept the approved hybrid baseline',async()=>{await post(c,`/workspaces/${w}/planning/baselines/${baselineId}/publish`).expect(200);const p=`/workspaces/${w}/scenarios`;const snapshot=(await c.agent.get('/api/v1'+p+`/baselines/${baselineId}/inputs`).expect(200)).body;const draft=(await post(c,p+'/drafts',syntheticScenario('sales',snapshot)).expect(201)).body.id;const version=(await post(c,p+`/drafts/${draft}/confirm`,{revision:1,assumptionsConfirmed:true}).expect(201)).body.id;const run=(await post(c,p+`/versions/${version}/runs`,{idempotencyKey:'m5-scenario'}).expect(201)).body.id;expect((await post(c,p+`/runs/${run}/replay`).expect(200)).body.matches).toBe(true);});
 it('weak evidence can create an explicitly assumption-led new baseline',async()=>{const r=await post(c,path()+'/compositions',{...composition(),idempotencyKey:'m5-fallback',mode:'assumption',artifactId:null,approvalId:null,assumptionValues:['80','90','100']}).expect(201);expect(r.body.assignments.filter((a:{source:string})=>a.source==='assumption')).toHaveLength(3);});
 it('a live lease rejects duplicate execution and an expired lease can recover',async()=>{const j=(await post(c,path()+'/jobs',{...req(),idempotencyKey:'m5-interrupted'}).expect(201)).body.id;await admin.query("UPDATE forecast_jobs SET status='running',attempt=1,started_at=now() WHERE id=$1",[j]);await post(c,path()+`/jobs/${j}/run`).expect(409);await admin.query("UPDATE forecast_jobs SET started_at=now()-interval '31 seconds' WHERE id=$1",[j]);const r=await post(c,path()+`/jobs/${j}/run`).expect(200);expect(r.body.status).toBe('succeeded');expect(r.body.attempt).toBe(2);expect((await admin.query('SELECT outcome FROM forecast_attempts WHERE job_id=$1 ORDER BY attempt',[j])).rows.map(r=>r.outcome)).toEqual(['FORECAST_INTERRUPTED','succeeded']);});
 it('a completion transaction failure cannot expose a partial completed artifact',async()=>{const j=(await post(c,path()+'/jobs',{...req(),idempotencyKey:'m5-atomic'}).expect(201)).body.id;await admin.query(`CREATE FUNCTION m5_test_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${j}'::uuid AND NEW.status='succeeded' THEN RAISE EXCEPTION 'synthetic completion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER m5_test_failure BEFORE UPDATE ON forecast_jobs FOR EACH ROW EXECUTE FUNCTION m5_test_fail_commit()`);try{await post(c,path()+`/jobs/${j}/run`).expect(500);expect((await admin.query('SELECT id FROM forecast_artifacts WHERE job_id=$1',[j])).rows).toHaveLength(0);expect((await admin.query('SELECT attempt FROM forecast_attempts WHERE job_id=$1',[j])).rows).toHaveLength(0);}finally{await admin.query('DROP TRIGGER m5_test_failure ON forecast_jobs; DROP FUNCTION m5_test_fail_commit()');}await admin.query("UPDATE forecast_jobs SET started_at=now()-interval '31 seconds' WHERE id=$1",[j]);expect((await post(c,path()+`/jobs/${j}/run`).expect(200)).body.status).toBe('succeeded');});
 it('process failure leaves no partial artifact and retry safely succeeds',async()=>{const j=(await post(c,path()+'/jobs',{...req(),idempotencyKey:'m5-retry'}).expect(201)).body.id;const python=process.env.FORECAST_PYTHON;process.env.FORECAST_PYTHON='missing-python-m5';try{const r=await post(c,path()+`/jobs/${j}/run`).expect(200);expect(r.body.status).toBe('failed');expect(r.body.artifact_id).toBeNull();expect(r.body.error_code).toBe('FORECAST_PROCESS_FAILED');}finally{if(python)process.env.FORECAST_PYTHON=python;else delete process.env.FORECAST_PYTHON;}const r=await post(c,path()+`/jobs/${j}/run`).expect(200);expect(r.body.status).toBe('succeeded');expect(r.body.attempt).toBe(2);expect((await admin.query('SELECT * FROM forecast_attempts WHERE job_id=$1',[j])).rows).toHaveLength(2);});
});

describe('M6 stress batches, deterministic risk and decision briefs',()=>{
 let owner:Client,manager:Client,outsider:Client,w:string,w2:string,baselineId:string,baselineRun:string,source:ReturnType<typeof stressSource>,policyId:string,definitionIds:string[],batchId:string,comparisonId:string,briefId:string,briefSnapshot:unknown;
 const path=()=>`/workspaces/${w}/stress`;
 const policy=()=>({title:'Explicit reserve',currency:'EGP',minimumCash:'100',minimumOperatingResult:'0',negativeCash:true,source:'Reviewed synthetic manager reserve',expectedRevision:0,reviewed:true});
 const newBatch=async(ids=definitionIds,key:string=randomUUID())=>(await post(owner,path()+'/batches',{title:'Adverse cases',definitionIds:ids,policyId,idempotencyKey:key}).expect(201)).body;
 beforeAll(async()=>{app=await createApp(readConfig({NODE_ENV:'test',APP_ORIGIN:origin,DATABASE_URL:'postgresql://unused:unused@localhost/unused',SESSION_SECRET:randomBytes(48).toString('hex')}),pool);owner=await client('m6-owner');manager=await client('m6-manager');outsider=await client('m6-foreign');w=await company(owner);w2=await company(outsider);await join(owner,manager,w,'MANAGER');const doc=stressSource().snapshot.document;const draft=(await post(owner,`/workspaces/${w}/planning/drafts`,doc).expect(201)).body.id;const version=(await post(owner,`/workspaces/${w}/planning/drafts/${draft}/confirm`,{revision:1}).expect(201)).body.id;baselineId=(await post(owner,`/workspaces/${w}/planning/baselines`,{planningVersionId:version}).expect(201)).body.id;await post(owner,`/workspaces/${w}/planning/baselines/${baselineId}/publish`).expect(200);baselineRun=(await post(owner,`/workspaces/${w}/planning/baselines/${baselineId}/runs`,{idempotencyKey:'m6-source'}).expect(201)).body.id;source=(await post(owner,path()+'/source',{kind:'baseline',runId:baselineRun}).expect(200)).body;});
 it('Owner versions a policy; Manager cannot change workspace thresholds',async()=>{await post(manager,path()+'/policies',policy()).expect(403);policyId=(await post(owner,path()+'/policies',policy()).expect(201)).body.id;await post(owner,path()+'/policies',policy()).expect(409);expect((await manager.agent.get('/api/v1'+path()+'/policies/'+policyId).expect(200)).body.rules[1].threshold).toBe('100');});
 it('rejects a currency-mismatched risk policy',async()=>{await post(owner,path()+'/policies',{...policy(),currency:'USD',expectedRevision:1}).expect(422);});
 it('confirms immutable predefined and combined stress definitions',async()=>{definitionIds=[];for(const kind of ['revenue_decrease','expense_increase','collection_delay'] as const){const d=stressDefinition(source,kind);d.title=kind;definitionIds.push((await post(manager,path()+'/definitions',{document:d,parentId:null}).expect(201)).body.id);}const combined=stressDefinition(source);combined.template='combined';combined.modifications.push(...stressDefinition(source,'expense_increase').modifications,...stressDefinition(source,'collection_delay').modifications);definitionIds.push((await post(owner,path()+'/definitions',{document:combined,parentId:null}).expect(201)).body.id);});
 it('editing an existing definition creates a new immutable version',async()=>{const original=(await owner.agent.get('/api/v1'+path()+'/definitions/'+definitionIds[0]).expect(200)).body;const document=structuredClone(original.document);document.modifications[0].rate='0.5';const next=(await post(owner,path()+'/definitions',{document,parentId:original.id}).expect(201)).body;expect(next.revision).toBe(2);expect((await owner.agent.get('/api/v1'+path()+'/definitions/'+original.id)).body).toEqual(original);});
 it('invalid overlap is blocked before confirmation',async()=>{const d=stressDefinition(source);d.modifications.push({...d.modifications[0],id:randomUUID()});await post(owner,path()+'/definitions',{document:d,parentId:null}).expect(422);});
 it('batch submission and execution are idempotent',async()=>{const b=await newBatch(definitionIds,'m6-batch');batchId=b.id;expect(b.status).toBe('pending');expect((await newBatch(definitionIds,'m6-batch')).id).toBe(batchId);const r=(await post(manager,path()+`/batches/${batchId}/run`).expect(200)).body;expect(r.status).toBe('completed');expect(r.children).toHaveLength(4);const ids=r.children.map((c:{result_id:string})=>c.result_id);expect((await post(owner,path()+`/batches/${batchId}/run`).expect(200)).body.children.map((c:{result_id:string})=>c.result_id)).toEqual(ids);});
 it('stressed results reconcile and replay under the exact risk-policy version',async()=>{const b=(await owner.agent.get('/api/v1'+path()+'/batches/'+batchId)).body;const r=(await owner.agent.get('/api/v1'+path()+'/results/'+b.children[2].result_id).expect(200)).body.result;expect(r.financial.periods.map((p:{closingCash:string})=>p.closingCash)).toEqual(['20.00','40.00','60.00']);expect(r.risk.findings.find((f:{ruleId:string})=>f.ruleId==='cash_reserve')).toMatchObject({policyId,firstPeriod:'2026-01',lastPeriod:'2026-03',durationMonths:3,recovery:'not_observed'});expect((await post(owner,path()+'/results/'+b.children[2].result_id+'/replay').expect(200)).body.matches).toBe(true);});
 it('one child failure preserves successful siblings and retry cannot duplicate results',async()=>{const b=await newBatch(definitionIds.slice(0,2));const failedChild=b.children[1].id;await admin.query(`CREATE FUNCTION m6_fail_child() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.child_id='${failedChild}'::uuid THEN RAISE EXCEPTION 'synthetic persistence failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER m6_failure BEFORE INSERT ON stress_results FOR EACH ROW EXECUTE FUNCTION m6_fail_child()`);let successful:string;try{const r=(await post(owner,path()+`/batches/${b.id}/run`).expect(200)).body;expect(r.status).toBe('partially_failed');expect(r.children[1].error_code).toBe('STRESS_EXECUTION_FAILED');expect(r.children[1].result_id).toBeNull();successful=r.children[0].result_id;}finally{await admin.query('DROP TRIGGER m6_failure ON stress_results; DROP FUNCTION m6_fail_child()');}const retried=(await post(owner,path()+`/batches/${b.id}/run`).expect(200)).body;expect(retried.status).toBe('completed');expect(retried.children[0].result_id).toBe(successful!);expect(retried.children[1].attempt).toBe(2);});
 it('cancellation stops pending children without publishing fabricated results',async()=>{const b=await newBatch();const r=(await post(owner,path()+`/batches/${b.id}/cancel`).expect(200)).body;expect(r.status).toBe('cancelled');expect(r.children.every((c:{status:string;result_id:unknown})=>c.status==='cancelled'&&c.result_id===null)).toBe(true);expect((await post(owner,path()+`/batches/${b.id}/run`).expect(200)).body.status).toBe('cancelled');});
 it('in-flight cancellation prevents committing a late child outcome',async()=>{const b=await newBatch([definitionIds[0]]);const claim=await transaction(pool,owner.id,w,db=>claimChild({db,workspaceId:w,actorId:owner.id,requestId:randomUUID()},b.id,b.children[0].id));await post(owner,path()+`/batches/${b.id}/cancel`).expect(200);await transaction(pool,owner.id,w,db=>finishChild({db,workspaceId:w,actorId:owner.id,requestId:randomUUID()},claim!,null,'TEST_FAILURE'));expect((await owner.agent.get('/api/v1'+path()+`/batches/${b.id}`)).body.children[0].status).toBe('cancelled');});
 it('comparison includes unstressed source and stressed variants',async()=>{const c=(await post(owner,path()+'/comparisons',{title:'Decision constraints',batchIds:[batchId],idempotencyKey:'m6-comparison'}).expect(201)).body;comparisonId=c.id;expect(c.document.options).toHaveLength(5);expect(c.document.options[0].financial.periods[2].closingCash).toBe('160.00');expect(c.document.policy.id).toBe(policyId);});
 it('brief numbers match exact stored comparison fields and have run references',async()=>{const b=(await post(manager,path()+'/briefs',{comparisonId}).expect(201)).body;briefId=b.id;briefSnapshot=b.document;const c=(await owner.agent.get('/api/v1'+path()+'/comparisons/'+comparisonId)).body.document;b.document.options.forEach((o:{ref:unknown;metrics:{value:string|null}[]},i:number)=>{expect(o.ref).toEqual(c.options[i].ref);expect(o.metrics.map(m=>m.value)).toEqual([c.options[i].financial.periods[2].closingCash,c.options[i].financial.minimumCash.amount,c.options[i].financial.periods[0].cashOutflows]);});expect((await post(owner,path()+`/briefs/${briefId}/replay`).expect(200)).body.matches).toBe(true);expect((await post(owner,path()+'/briefs',{comparisonId}).expect(201)).body.id).toBe(briefId);});
 it('lists saved stress comparisons only for authorized workspace members',async()=>{
 for(const user of [owner,manager]){const response=await user.agent.get('/api/v1'+path()+'/comparisons').expect(200);expect(response.body.comparisons.map((c:{id:string})=>c.id)).toContain(comparisonId);expect(response.body.comparisons[0]).toHaveProperty('created_at');}
 await outsider.agent.get('/api/v1'+path()+'/comparisons').expect(404);
 const other=await outsider.agent.get('/api/v1/workspaces/'+w2+'/stress/comparisons').expect(200);expect(other.body.comparisons).toEqual([]);
 });
 it('later risk policy and stress versions do not change historical briefs',async()=>{const newPolicy=(await post(owner,path()+'/policies',{...policy(),minimumCash:'1000',expectedRevision:1}).expect(201)).body;expect(newPolicy.id).not.toBe(policyId);expect((await owner.agent.get('/api/v1'+path()+`/briefs/${briefId}`)).body.document).toEqual(briefSnapshot);expect((await post(owner,path()+`/briefs/${briefId}/replay`)).body.matches).toBe(true);const different=(await post(owner,path()+'/batches',{title:'New policy run',definitionIds:[definitionIds[0]],policyId:newPolicy.id,idempotencyKey:'m6-new-policy'}).expect(201)).body;await post(owner,path()+`/batches/${different.id}/run`).expect(200);await post(owner,path()+'/comparisons',{title:'Invalid policy mix',batchIds:[batchId,different.id],idempotencyKey:'bad-policy'}).expect(422);});
 it('isolates every M6 read artifact and referenced IDs',async()=>{for(const [kind,id] of [['policies',policyId],['definitions',definitionIds[0]],['batches',batchId],['comparisons',comparisonId],['briefs',briefId]]){await outsider.agent.get('/api/v1'+path()+`/${kind}/${id}`).expect(404);await outsider.agent.get(`/api/v1/workspaces/${w2}/stress/${kind}/${id}`).expect(404);}await post(outsider,`/workspaces/${w2}/stress/source`,{kind:'baseline',runId:baselineRun}).expect(404);await post(outsider,`/workspaces/${w2}/stress/batches`,{title:'foreign',definitionIds:[definitionIds[0]],policyId,idempotencyKey:'foreign'}).expect(404);await post(outsider,`/workspaces/${w2}/stress/briefs`,{comparisonId}).expect(404);await post(outsider,`/workspaces/${w2}/stress/batches/${batchId}/run`).expect(404);});
 it('all M6 tables enforce tenant RLS and immutable analytical artifacts',async()=>{for(const table of ['risk_policy_versions','stress_definitions','stress_batches','stress_children','stress_attempts','stress_results','stress_cancellations','stress_comparisons','decision_briefs']){expect((await pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);await transaction(pool,outsider.id,w2,async db=>expect((await db.query(`SELECT * FROM ${table} WHERE workspace_id=$1`,[w])).rows).toHaveLength(0));if(table!=='stress_children')await expect(admin.query(`UPDATE ${table} SET workspace_id=workspace_id WHERE workspace_id=$1`,[w])).rejects.toThrow();}});
 it('M3 scenarios can be stressed without altering original scenario results',async()=>{const p=`/workspaces/${w}/scenarios`;const snapshot=(await owner.agent.get('/api/v1'+p+`/baselines/${baselineId}/inputs`).expect(200)).body;const d=(await post(owner,p+'/drafts',syntheticScenario('sales',snapshot)).expect(201)).body.id;const v=(await post(owner,p+`/drafts/${d}/confirm`,{revision:1,assumptionsConfirmed:true}).expect(201)).body.id;const run=(await post(owner,p+`/versions/${v}/runs`,{idempotencyKey:'m6-scenario'}).expect(201)).body.id;const before=(await owner.agent.get('/api/v1'+p+'/runs/'+run)).body;const s=(await post(owner,path()+'/source',{kind:'scenario',runId:run}).expect(200)).body;const stress=stressDefinition(s);stress.modifications[0].end=s.snapshot.document.entries.find((e:{id:string})=>e.id===stress.modifications[0].targetEntryId).end;const def=(await post(owner,path()+'/definitions',{document:stress,parentId:null}).expect(201)).body.id;const b=await newBatch([def]);await post(owner,path()+`/batches/${b.id}/run`).expect(200);const c=(await post(owner,path()+'/comparisons',{title:'Baseline and scenario with stress',batchIds:[batchId,b.id],idempotencyKey:'m6-scenario-comparison'}).expect(201)).body;expect(c.document.options.some((o:{label:string})=>o.label===s.title)).toBe(true);expect((await owner.agent.get('/api/v1'+p+'/runs/'+run)).body).toEqual(before);});
 it('expired child leases recover, and the third interrupted attempt settles as failed',async()=>{
  const b=await newBatch([definitionIds[0]]),id=b.children[0].id;
  await admin.query("UPDATE stress_children SET status='running',attempt=1,started_at=now() WHERE id=$1",[id]);
  expect((await post(owner,path()+`/batches/${b.id}/run`).expect(200)).body.children[0].attempt).toBe(1);
  await admin.query("UPDATE stress_children SET started_at=now()-interval '31 seconds' WHERE id=$1",[id]);
  expect((await post(owner,path()+`/batches/${b.id}/run`).expect(200)).body.children[0]).toMatchObject({status:'succeeded',attempt:2});
  const exhausted=await newBatch([definitionIds[0]]);
  await admin.query("UPDATE stress_children SET status='running',attempt=3,started_at=now()-interval '31 seconds' WHERE id=$1",[exhausted.children[0].id]);
  expect((await post(owner,path()+`/batches/${exhausted.id}/run`).expect(200)).body.children[0]).toMatchObject({status:'failed',attempt:3,error_code:'RETRY_LIMIT',result_id:null});
 });
 it('completion rollback leaves no partial result and cancellation retains successful siblings',async()=>{
  const b=await newBatch(definitionIds.slice(0,2)),id=b.children[1].id;
  await admin.query(`CREATE FUNCTION m6_fail_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id}'::uuid AND NEW.status='succeeded' THEN RAISE EXCEPTION 'synthetic completion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER m6_completion_failure BEFORE UPDATE ON stress_children FOR EACH ROW EXECUTE FUNCTION m6_fail_completion()`);
  try{
   const r=(await post(owner,path()+`/batches/${b.id}/run`).expect(200)).body;
   expect(r.status).toBe('partially_failed');expect(r.children[0].status).toBe('succeeded');
   expect((await admin.query('SELECT id FROM stress_results WHERE child_id=$1',[id])).rows).toHaveLength(0);
   expect((await admin.query('SELECT outcome FROM stress_attempts WHERE child_id=$1',[id])).rows).toEqual([{outcome:'STRESS_EXECUTION_FAILED'}]);
   const cancelled=(await post(owner,path()+`/batches/${b.id}/cancel`).expect(200)).body;
   expect(cancelled.children[0].result_id).toBe(r.children[0].result_id);expect(cancelled.children[1].status).toBe('cancelled');
   await outsider.agent.get(`/api/v1/workspaces/${w2}/stress/results/${r.children[0].result_id}`).expect(404);
  }finally{await admin.query('DROP TRIGGER m6_completion_failure ON stress_children; DROP FUNCTION m6_fail_completion()');}
 });
 it('approved M5 forecasts are stressed without Python and later source changes preserve the brief',async()=>{
  const confirm=async(doc:PlanningDocument)=>{const d=(await post(owner,`/workspaces/${w}/planning/drafts`,doc).expect(201)).body.id;return (await post(owner,`/workspaces/${w}/planning/drafts/${d}/confirm`,{revision:1}).expect(201)).body.id as string;};
  const ids:string[]=[];for(const doc of forecastDocuments())ids.push(await confirm(doc));
  const template=futureTemplate(),templateId=await confirm(template),fp=`/workspaces/${w}/forecasts`;
  const request={planningVersionIds:ids,componentKey:'sales',origin:'2023-01',horizon:3,nature:'variable',structuralChange:false,historyReviewed:true,idempotencyKey:'m6-forecast'};
  const job=(await post(owner,fp+'/jobs',request).expect(201)).body.id;
  const artifactId=(await post(owner,fp+`/jobs/${job}/run`).expect(200)).body.artifact_id;
  const approvalId=(await post(owner,fp+`/artifacts/${artifactId}/approve`,{reviewed:true}).expect(200)).body.id;
  const hybrid=(await post(owner,fp+'/compositions',{idempotencyKey:'m6-hybrid',templateVersionId:templateId,artifactId,approvalId,componentKey:'sales',origin:'2023-01',horizon:3,title:'M6 stored forecast',mode:'forecast',assumptionValues:[],note:'Reviewed synthetic trend',cashTreatment:{kind:'profile',buckets:[{offsetMonths:0,proportion:'1'}]},category:'revenue',effect:'revenue',replaceEntryIds:[template.entries[0].id],sourcesReviewed:true}).expect(201)).body.baseline_version_id;
  await post(owner,`/workspaces/${w}/planning/baselines/${hybrid}/publish`).expect(200);
  const run=(await post(owner,`/workspaces/${w}/planning/baselines/${hybrid}/runs`,{idempotencyKey:'m6-hybrid-run'}).expect(201)).body.id;
  const s=(await post(owner,path()+'/source',{kind:'baseline',runId:run}).expect(200)).body;
  const d=stressDefinition(s);const entry=s.snapshot.document.entries.find((e:{id:string})=>e.id===d.modifications[0].targetEntryId);d.modifications[0].start=entry.start;d.modifications[0].end=entry.end;
  const python=process.env.FORECAST_PYTHON;process.env.FORECAST_PYTHON='missing-python-m6';
  let brief:{id:string;document:unknown};
  try{
   const def=(await post(owner,path()+'/definitions',{document:d,parentId:null}).expect(201)).body.id;
   const b=await newBatch([def]);const completed=(await post(owner,path()+`/batches/${b.id}/run`).expect(200)).body;
   expect(completed.status).toBe('completed');expect((await post(owner,path()+`/results/${completed.children[0].result_id}/replay`).expect(200)).body.matches).toBe(true);
   const comparison=(await post(owner,path()+'/comparisons',{title:'Stored forecast pressure',batchIds:[b.id],idempotencyKey:'m6-hybrid-comparison'}).expect(201)).body.id;
   brief=(await post(owner,path()+'/briefs',{comparisonId:comparison}).expect(201)).body;
   await post(owner,path()+'/comparisons',{title:'Different baseline rejected',batchIds:[batchId,b.id],idempotencyKey:'m6-incompatible-baseline'}).expect(422);
  }finally{if(python)process.env.FORECAST_PYTHON=python;else delete process.env.FORECAST_PYTHON;}
  await confirm(forecastDocuments(12,()=> '999')[0]);
  const next=(await post(owner,fp+'/jobs',{...request,idempotencyKey:'m6-later-forecast'}).expect(201)).body.id;await post(owner,fp+`/jobs/${next}/run`).expect(200);
  const ip=`/workspaces/${w}/imports`;const file=(await owner.agent.post('/api/v1'+ip).set('Origin',origin).set('X-CSRF-Token',owner.csrf).set('Content-Type','application/octet-stream').set('X-File-Name','01-clean-service.xlsx').send(await fixtureBytes('01-clean-service.xlsx')).expect(201)).body.id;
  const mapping=(await post(owner,ip+`/${file}/select-sheet`,{sheet:'Service',headerRow:1}).expect(201)).body.id;
  await patch(owner,ip+`/mappings/${mapping}`,{revision:1,mapping:reviewed(await fixtureRaw('01-clean-service.xlsx'))}).expect(200);
  expect((await owner.agent.get('/api/v1'+path()+`/briefs/${brief!.id}`).expect(200)).body.document).toEqual(brief!.document);
  expect((await post(owner,path()+`/briefs/${brief!.id}/replay`).expect(200)).body.matches).toBe(true);
 });});



describe('M7 revised scope boundaries',()=>{
 let owner:Client,manager:Client,analyst:Client,outsider:Client,w:string,b:string,legacy:string;
 let calls=0,fail=false;
 let started:()=>void=()=>{},release:()=>void=()=>{};let wait=false,gate=Promise.resolve();
 beforeAll(async()=>{
  app=await createApp(readConfig({NODE_ENV:'test',APP_ORIGIN:origin,DATABASE_URL:'postgresql://unused:unused@localhost/unused',SESSION_SECRET:randomBytes(48).toString('hex'),AI_ENABLED:'true',GROQ_API_KEY:'synthetic-test-only'}),pool,undefined,async()=>{
   calls++;if(wait){started();await gate;}if(fail)throw new Error('private provider detail');
   return {task:'assumption_review',payload:{claims:[{kind:'reported',ref:'f1'}]}};
  });
  owner=await client('revised-owner');manager=await client('revised-manager');analyst=await client('revised-analyst');outsider=await client('revised-outsider');w=await company(owner);
  await join(owner,manager,w,'MANAGER');await join(owner,analyst,w,'ANALYST');
  const p=`/workspaces/${w}/planning`;
  const d=(await post(owner,p+'/drafts',syntheticFixture('new-company')).expect(201)).body.id;
  const v=(await post(owner,p+`/drafts/${d}/confirm`,{revision:1}).expect(201)).body.id;
  b=(await post(owner,p+'/baselines',{planningVersionId:v}).expect(201)).body.id;await post(owner,p+`/baselines/${b}/publish`).expect(200);
  // Historical artifact fixture; never invokes the retired provider path.
  const r=randomUUID();legacy=randomUUID();
  await admin.query("INSERT INTO ai_requests(id,workspace_id,actor_id,idempotency_key,request_hash,source_hash,source_ref,task,locale,depth,status) VALUES($1,$2,$3,$4,'historical','historical',$5,'scenario_extract','en',0,'succeeded')",[r,w,owner.id,randomUUID(),{kind:'published_baseline',id:b,revision:null}]);
  const output={schemaVersion:'m7-1',task:'scenario_extract',outcome:'needs_clarification',summary:'Please specify salary and timing.',questions:[{id:'salary',field:'salary',question:'What salary?',reason:'Required input'}],warnings:[],payload:{title:null,decisionType:'hiring',changes:[],expansion:null,paybackRequested:null}};
  await admin.query("INSERT INTO ai_artifacts(id,workspace_id,request_id,output,evidence,input_chain,model,schema_version,prompt_version) VALUES($1,$2,$3,$4,$5,$6,'historical','m7-1','historical')",[legacy,w,r,output,{facts:{},entries:{},scopes:{},currency:'EGP'},{text:'Hire someone.',answers:[]}]);
 });
 const input=(task='assumption_review')=>({task,locale:'en',source:{kind:'published_baseline',id:b,revision:null},text:'Review saved assumptions.',priorArtifactId:null,answers:[],consentVersion:'groq-minimal-context-1',idempotencyKey:randomUUID()});
 it('requires authentication',async()=>{await request(app).get(`/api/v1/workspaces/${w}/ai/capabilities`).expect(401);});
 it('advertises only supported generation tasks',async()=>{const r=await owner.agent.get(`/api/v1/workspaces/${w}/ai/capabilities`).expect(200);expect(r.body.tasks).toEqual(['assumption_review','result_explain','brief_narrative']);expect(r.body.freeTextExtraction).toBe(false);});
 for(const endpoint of ['requests','context'])it(`retires extraction and continuation at ${endpoint} without provider or artifacts`,async()=>{
  const before=calls;const count=(await admin.query('SELECT count(*) FROM ai_artifacts')).rows;
  for(const priorArtifactId of [null,legacy]){const r=await post(owner,`/workspaces/${w}/ai/${endpoint}`,{...input('scenario_extract'),priorArtifactId}).expect(410);expect(r.body.error.code).toBe('AI_EXTRACTION_RETIRED');}
  expect(calls).toBe(before);expect((await admin.query('SELECT count(*) FROM ai_artifacts')).rows).toEqual(count);
 });
 it('preserves authorized historical reads and listing for all roles',async()=>{const before=calls;for(const c of [owner,manager,analyst]){await c.agent.get(`/api/v1/workspaces/${w}/ai/artifacts/${legacy}`).expect(200);const r=await c.agent.get(`/api/v1/workspaces/${w}/ai/artifacts?sourceId=${b}&task=scenario_extract`).expect(200);expect(r.body.artifacts[0].id).toBe(legacy);}expect(calls).toBe(before);});
 it('hides history and new assistance from foreign tenants',async()=>{const before=calls;await outsider.agent.get(`/api/v1/workspaces/${w}/ai/artifacts/${legacy}`).expect(404);await post(outsider,`/workspaces/${w}/ai/requests`,input()).expect(404);expect(calls).toBe(before);});
 it('preserves immutable historical artifacts and RLS',async()=>{await expect(transaction(pool,owner.id,w,db=>db.query('UPDATE ai_artifacts SET output=$1 WHERE id=$2',[{},legacy]))).rejects.toThrow();const rows=await transaction(pool,outsider.id,w,db=>db.query('SELECT id FROM ai_artifacts WHERE id=$1',[legacy]));expect(rows.rowCount).toBe(0);});
 it('generates grounded review for all roles without financial mutation',async()=>{const before=(await admin.query('SELECT count(*) FROM scenario_drafts WHERE workspace_id=$1',[w])).rows;for(const c of [owner,manager,analyst]){const r=await post(c,`/workspaces/${w}/ai/requests`,input()).expect(201);expect(r.body.proposal).toBeNull();}expect((await admin.query('SELECT count(*) FROM scenario_drafts WHERE workspace_id=$1',[w])).rows).toEqual(before);});
 it('reuses saved assistance idempotently',async()=>{const value=input();const a=await post(manager,`/workspaces/${w}/ai/requests`,value).expect(201);const before=calls;const again=await post(manager,`/workspaces/${w}/ai/requests`,value).expect(201);expect(again.body.id).toBe(a.body.id);expect(calls).toBe(before);await post(manager,`/workspaces/${w}/ai/requests`,{...value,text:'Changed'}).expect(409);});
 it('sanitizes unavailable provider and preserves manual access',async()=>{fail=true;try{const r=await post(analyst,`/workspaces/${w}/ai/requests`,input()).expect(503);expect(JSON.stringify(r.body)).not.toContain('private provider detail');await analyst.agent.get(`/api/v1/workspaces/${w}/planning/baselines`).expect(200);}finally{fail=false;}});
 it('reopens Arabic review without a new provider request',async()=>{const r=await post(owner,`/workspaces/${w}/ai/requests`,{...input(),locale:'ar'}).expect(201);const before=calls;const saved=await owner.agent.get(`/api/v1/workspaces/${w}/ai/artifacts/${r.body.id}`).expect(200);expect(saved.body.output.summary).toBe('شرح الأدلة');expect(calls).toBe(before);});
 it('does not apply a historical clarification artifact',async()=>{await post(owner,`/workspaces/${w}/ai/artifacts/${legacy}/apply`,{reviewed:false,document:{}}).expect(400);});
 it('discards inference after membership revocation without holding a transaction',async()=>{
  const c=await client('revised-inflight');await join(owner,c,w,'ANALYST');wait=true;
  gate=new Promise<void>(r=>release=r);const entered=new Promise<void>(r=>started=r);
  const pending=post(c,`/workspaces/${w}/ai/requests`,input()).then(r=>r);
  await entered;
  expect((await admin.query("SELECT count(*) FROM pg_stat_activity WHERE usename='planner_app' AND state='idle in transaction'")).rows[0].count).toBe('0');
  await admin.query('DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2',[w,c.id]);release();
  const result=await pending;wait=false;expect([403,404]).toContain(result.status);
  expect((await admin.query('SELECT count(*) FROM ai_artifacts a JOIN ai_requests r ON a.request_id=r.id WHERE r.actor_id=$1',[c.id])).rows[0].count).toBe('0');
 });
 it('blocks archived workspace before provider call',async()=>{const before=calls;await admin.query("UPDATE workspaces SET status='archived' WHERE id=$1",[w]);await post(owner,`/workspaces/${w}/ai/requests`,input()).expect(409);expect(calls).toBe(before);});

});
