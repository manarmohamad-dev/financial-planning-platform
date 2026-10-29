/** Isolated local acceptance environment. Never connects to .env DATABASE_URL or Neon. */
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrate } from './migrate.js';
import { createApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { hashPassword } from '../apps/api/src/password.js';
import { transaction } from '../apps/api/src/db.js';
import {
  createFinancialDraft,
  confirmPlanning,
  prepareBaseline,
  publishBaseline,
  executeBaseline,
} from '../apps/api/src/planning-service.js';
import {
  publishedSnapshot,
  createScenario,
  confirmScenario,
  executeScenario,
} from '../apps/api/src/scenario-service.js';
import * as stress from '../apps/api/src/stress-service.js';
import { runStress } from '../packages/stress/src/engine.js';
import { syntheticFixture } from '../packages/planning/src/fixtures.js';
import { syntheticScenario } from '../packages/scenarios/src/fixtures.js';
if (!process.argv.includes('--local-synthetic'))
  throw new Error('Explicit --local-synthetic required');
const directory = resolve('.local', `m7-browser-${randomUUID()}`);
mkdirSync(directory, { recursive: true });
const password = randomBytes(24).toString('hex');
const embedded = new EmbeddedPostgres({
  initdbFlags: ['--encoding=UTF8'],
  databaseDir: resolve(directory, 'postgres'),
  user: 'postgres',
  password,
  port: 55449,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
await embedded.initialise();
await embedded.start();
const admin = new Pool({
  connectionString: `postgresql://postgres:${password}@127.0.0.1:55449/postgres`,
});
await migrate(admin);
await admin.query(`ALTER ROLE planner_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
const databaseUrl = `postgresql://planner_app:${password}@127.0.0.1:55449/postgres`;
const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const accounts: Record<string, string> = {};
const syntheticPassword = 'M7-local-synthetic-review-2026!';
for (const role of ['OWNER', 'MANAGER', 'ANALYST']) {
  const id = randomUUID();
  accounts[role] = id;
  await admin.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [
    id,
    `${role.toLowerCase()}@m7.example.test`,
    `M7 synthetic ${role}`,
    await hashPassword(syntheticPassword),
  ]);
}
const workspaceId = randomUUID();
await transaction(pool, accounts.OWNER, undefined, async (db) => {
  await db.query(
    "INSERT INTO workspaces(id,kind,name,currency,created_by) VALUES($1,'company','M7 synthetic acceptance','EGP',$2)",
    [workspaceId, accounts.OWNER],
  );
  await db.query("SELECT set_config('app.workspace_id',$1,true)", [workspaceId]);
  await db.query('SELECT bootstrap_owner($1)', [workspaceId]);
  for (const role of ['MANAGER', 'ANALYST'])
    await db.query('INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,$3)', [
      workspaceId,
      accounts[role],
      role,
    ]);
});
const records = await transaction(pool, accounts.OWNER, workspaceId, async (db) => {
  const c = { db, actorId: accounts.OWNER, workspaceId, requestId: randomUUID() };
  const d = await createFinancialDraft(c, syntheticFixture('service'));
  const v = await confirmPlanning(c, d.id, 1);
  const b = await prepareBaseline(c, v.id);
  await publishBaseline(c, b.id);
  const baselineRun = await executeBaseline(c, b.id, 'm7-review-baseline');
  const scenario = await createScenario(
    c,
    syntheticScenario('sales', await publishedSnapshot(c, b.id)),
  );
  const version = await confirmScenario(c, scenario.id, 1);
  const run = await executeScenario(c, version.id, 'm7-review-scenario');
  const policy = await stress.createPolicy(c, { title: 'Synthetic reviewed reserve', currency: 'EGP', minimumCash: '100', minimumOperatingResult: '0', negativeCash: true, source: 'Explicit synthetic acceptance assumption', expectedRevision: 0, reviewed: true });
  const definition = await stress.createDefinition(c, { version: 'stress-1.0.0', title: 'Synthetic zero-change control', source: { kind: 'scenario', runId: run.id }, template: 'zero', modifications: [], reviewed: true }, null);
  const batch = await stress.createBatch(c, { title: 'Synthetic acceptance batch', definitionIds: [definition.id], policyId: policy.id, idempotencyKey: 'm7-print-batch' });
  for (const child of batch.children) {
    const claim = await stress.claimChild(c, batch.id, child.id);
    if (!claim) throw new Error('Missing synthetic claim');
    const id = randomUUID();
    const result = runStress(claim.definition.source, claim.definition.document, claim.definition.id, id, claim.policy, { id: claim.definition.createdBy, at: claim.definition.createdAt });
    await stress.finishChild(c, claim, { id, result }, null);
  }
  const comparison = await stress.createStressComparison(c, { title: 'M7 synthetic acceptance comparison', batchIds: [batch.id], idempotencyKey: 'm7-print-comparison' });
  const brief = await stress.createBrief(c, comparison.id);
  return { baseline: b.id, baselineRun: baselineRun.id, scenario: scenario.id, run: run.id, comparison: comparison.id, brief: brief.id };
});
const app = await createApp(
  readConfig({
    NODE_ENV: 'development',
    APP_ORIGIN: 'http://localhost:4324',
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: randomBytes(48).toString('hex'),
    AI_ENABLED: 'false',
    GOOGLE_AUTH_ENABLED: process.env.GOOGLE_AUTH_ENABLED ?? 'false',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  }),
  pool,
);
const server = app.listen(4324, '127.0.0.1');
const disabledApp = await createApp(readConfig({ NODE_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:4325', DATABASE_URL: databaseUrl, SESSION_SECRET: randomBytes(48).toString('hex'), AI_ENABLED: 'false' }), pool);
const disabledServer = disabledApp.listen(4325, '127.0.0.1');
writeFileSync(
  '.local/auth-browser-review.json',
  JSON.stringify(
    { url: 'http://localhost:4324', workspaceId, records, directory, syntheticOnly: true },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    ready: true,
    url: 'http://localhost:4324',
    workspaceId,
    records,
    syntheticOnly: true,
  }),
);
async function stop() {
  server.close();
  disabledServer.close();
  await pool.end();
  await admin.end();
  await embedded.stop();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
