import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Pool } from 'pg';
export async function migrate(pool: Pool, directory = resolve('migrations')): Promise<void> {
  const db = await pool.connect();
  try {
    await db.query('SELECT pg_advisory_lock(87123911)');
    await db.query(
      "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='planner_app') THEN CREATE ROLE planner_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$",
    );
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const file of (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort()) {
      if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file])).rowCount)
        continue;
      await db.query('BEGIN');
      try {
        await db.query(await readFile(resolve(directory, file), 'utf8'));
        await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
        await db.query('COMMIT');
      } catch (e) {
        await db.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await db.query('SELECT pg_advisory_unlock(87123911)');
    db.release();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is required');
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(pool);
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }
}
