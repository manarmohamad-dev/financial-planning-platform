import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
export function createPool(url: string): Pool {
  return new Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
}
export async function transaction<T>(
  pool: Pool,
  actorId: string,
  workspaceId: string | undefined,
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
      [actorId, workspaceId ?? ''],
    );
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
export async function audit(
  db: PoolClient,
  workspaceId: string,
  actorId: string,
  action: string,
  resourceId: string,
  requestId: string,
  metadata: Record<string, string | number> = {},
): Promise<void> {
  await db.query(
    'INSERT INTO audit_events(id,workspace_id,actor_id,action,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(), workspaceId, actorId, action, resourceId, requestId, metadata],
  );
}
