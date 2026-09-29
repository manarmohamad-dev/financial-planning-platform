/** Isolated synthetic acceptance environment. Never uses the developer's company database. */
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { migrate } from './migrate.js';
import { createApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import { stressSource, stressDefinition } from '../tests/stress-helpers.js';
import { syntheticScenario } from '../packages/scenarios/src/fixtures.js';
const origin = 'http://localhost:3100';
const directory = resolve('.local/saas-refinement-' + Date.now());
await mkdir(directory, { recursive: true });
const password = randomBytes(24).toString('hex');
const pg = new EmbeddedPostgres({
  databaseDir: resolve(directory, 'postgres'),
  user: 'postgres',
  password,
  port: 55436,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => undefined,
  onError: () => undefined,
});
await pg.initialise();
await pg.start();
const admin = new Pool({
  connectionString: `postgresql://postgres:${password}@127.0.0.1:55436/postgres`,
});
await migrate(admin);
await admin.query(`ALTER ROLE planner_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
const pool = new Pool({
  connectionString: `postgresql://planner_app:${password}@127.0.0.1:55436/postgres`,
});
const app = await createApp(
  readConfig({
    NODE_ENV: 'test',
    PORT: '3100',
    APP_ORIGIN: origin,
    DATABASE_URL: 'postgresql://unused:unused@localhost/unused',
    SESSION_SECRET: randomBytes(48).toString('hex'),
  }),
  pool,
);
const server = app.listen(3100);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Heterogeneous acceptance endpoint responses.
type Json = Record<string, any>;
async function client(role: string) {
  let cookie = '';
  const call = async (path: string, method = 'GET', body?: unknown): Promise<Json> => {
    const csrf = method === 'GET' ? '' : (await call('/auth/csrf')).token;
    const response = await fetch(origin + '/api/v1' + path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: origin,
        ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const updated = response.headers.getSetCookie();
    if (updated.length) cookie = updated.map((c) => c.split(';')[0]).join('; ');
    const data = await response.json();
    if (!response.ok) throw new Error(path + ': ' + JSON.stringify(data));
    return data;
  };
  const email = `saas-${role.toLowerCase()}@example.test`;
  await call('/auth/register', 'POST', {
    email,
    password: 'Synthetic-Review-2026!',
    displayName: 'SaaS ' + role,
  });
  return { email, call };
}
const owner = await client('Owner'),
  manager = await client('Manager'),
  analyst = await client('Analyst');
const w = (
  await owner.call('/workspaces', 'POST', {
    name: 'SaaS acceptance — synthetic only',
    currency: 'EGP',
  })
).id;
for (const [person, role] of [
  [manager, 'MANAGER'],
  [analyst, 'ANALYST'],
] as const) {
  const invitation = await owner.call(`/workspaces/${w}/invitations`, 'POST', {
    email: person.email,
    role,
  });
  await person.call('/invitations/accept', 'POST', { token: invitation.token });
}
const base = `/workspaces/${w}`;
const draft = await analyst.call(
  base + '/planning/drafts',
  'POST',
  stressSource().snapshot.document,
);
const version = await analyst.call(base + `/planning/drafts/${draft.id}/confirm`, 'POST', {
  revision: 1,
});
const baseline = await analyst.call(base + '/planning/baselines', 'POST', {
  planningVersionId: version.id,
});
await manager.call(base + `/planning/baselines/${baseline.id}/publish`, 'POST', {});
const run = await analyst.call(base + `/planning/baselines/${baseline.id}/runs`, 'POST', {
  idempotencyKey: randomUUID(),
});
const snapshot = await owner.call(base + `/scenarios/baselines/${baseline.id}/inputs`);
const scenario = await manager.call(
  base + '/scenarios/drafts',
  'POST',
  syntheticScenario('sales', snapshot as Parameters<typeof syntheticScenario>[1]),
);
const scenarioVersion = await manager.call(
  base + `/scenarios/drafts/${scenario.id}/confirm`,
  'POST',
  { revision: 1, assumptionsConfirmed: true },
);
const scenarioRun = await manager.call(
  base + `/scenarios/versions/${scenarioVersion.id}/runs`,
  'POST',
  { idempotencyKey: randomUUID() },
);
const source = await owner.call(base + '/stress/source', 'POST', {
  kind: 'baseline',
  runId: run.id,
});
const policy = await owner.call(base + '/stress/policies', 'POST', {
  title: 'Reviewed synthetic constraints',
  currency: 'EGP',
  minimumCash: '100',
  minimumOperatingResult: '0',
  negativeCash: true,
  source: 'Explicit synthetic acceptance policy',
  expectedRevision: 0,
  reviewed: true,
});
const definition = await manager.call(base + '/stress/definitions', 'POST', {
  document: stressDefinition(source as Parameters<typeof stressDefinition>[0]),
  parentId: null,
});
const batch = await manager.call(base + '/stress/batches', 'POST', {
  title: 'Synthetic sales stress',
  definitionIds: [definition.id],
  policyId: policy.id,
  idempotencyKey: randomUUID(),
});
await manager.call(base + `/stress/batches/${batch.id}/run`, 'POST', {});
const comparison = await manager.call(base + '/stress/comparisons', 'POST', {
  title: 'Synthetic decision evidence',
  batchIds: [batch.id],
  idempotencyKey: randomUUID(),
});
const brief = await manager.call(base + '/stress/briefs', 'POST', { comparisonId: comparison.id });
const evidence = {
  origin,
  workspaceId: w,
  planningVersionId: version.id,
  baselineId: baseline.id,
  runId: run.id,
  scenarioRunId: scenarioRun.id,
  comparisonId: comparison.id,
  briefId: brief.id,
  accounts: [owner.email, manager.email, analyst.email],
  password: 'Synthetic-Review-2026!',
};
await writeFile('.local/saas-acceptance.json', JSON.stringify(evidence, null, 2));
console.log('Synthetic preview ready. Local access details are in .local/saas-acceptance.json.');
async function stop() {
  server.close();
  await pool.end();
  await admin.end();
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
