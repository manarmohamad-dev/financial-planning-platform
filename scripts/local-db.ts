import EmbeddedPostgres from 'embedded-postgres';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from './migrate.js';
const dir = resolve('.local');
await mkdir(dir, { recursive: true });
const secretPath = resolve(dir, 'db-secret');
let password: string;
try {
  password = await readFile(secretPath, 'utf8');
} catch {
  password = randomBytes(32).toString('hex');
  await writeFile(secretPath, password, { mode: 0o600 });
}
const databaseDir = resolve(dir, 'postgres');
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password,
  port: 55432,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => undefined,
  onError: (message) => {
    if (String(message).includes('FATAL')) console.error('PostgreSQL startup failed');
  },
});
try {
  await access(resolve(databaseDir, 'PG_VERSION'));
} catch {
  await pg.initialise();
}
await pg.start();
const admin = new Pool({
  connectionString: `postgresql://postgres:${password}@127.0.0.1:55432/postgres`,
});
if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='planner'")).rowCount)
  await admin.query('CREATE DATABASE planner');
await admin.end();
const migrationUrl = `postgresql://postgres:${password}@127.0.0.1:55432/planner`;
const pool = new Pool({ connectionString: migrationUrl });
await migrate(pool);
// Hex-generated development credential, never user input or committed to source control.
await pool.query(`ALTER ROLE planner_app LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
await pool.end();
try {
  await access('.env');
} catch {
  await writeFile(
    '.env',
    `NODE_ENV=development\nPORT=3000\nAPP_ORIGIN=http://localhost:4200\nDATABASE_URL=postgresql://planner_app:${password}@127.0.0.1:55432/planner\nMIGRATION_DATABASE_URL=${migrationUrl}\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nTRUST_PROXY_HOPS=0\n`,
    { mode: 0o600 },
  );
}
console.log('Local PostgreSQL ready on 127.0.0.1:55432. .env is ready. Keep this process running.');
process.on('SIGINT', () => {
  void pg.stop().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void pg.stop().then(() => process.exit(0));
});
setInterval(() => undefined, 60000);
