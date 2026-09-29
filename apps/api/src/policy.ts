import type { PoolClient } from 'pg';
import {
  rolePermissions,
  demoPermissions,
  type Role,
  type Permission,
} from '../../../packages/contracts/src/index.js';
import { AppError } from './errors.js';
export type WorkspaceAccess = {
  id: string;
  kind: 'company' | 'demo';
  name: string;
  currency: string;
  status: 'active' | 'archived';
  revision: number;
  role: Role | null;
  permissions: readonly Permission[];
};
export async function workspaceAccess(
  db: PoolClient,
  workspaceId: string,
  actorId: string,
): Promise<WorkspaceAccess> {
  const result = await db.query(
    'SELECT w.id,w.kind,w.name,w.currency,w.status,w.revision,m.role FROM workspaces w LEFT JOIN memberships m ON m.workspace_id=w.id AND m.user_id=$2 WHERE w.id=$1',
    [workspaceId, actorId],
  );
  const row = result.rows[0] as Omit<WorkspaceAccess, 'permissions'> | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND');
  return {
    ...row,
    permissions: row.kind === 'demo' ? demoPermissions : row.role ? rolePermissions[row.role] : [],
  };
}
export function authorize(access: WorkspaceAccess, permission: Permission): void {
  if (access.status !== 'active') throw new AppError(409, 'WORKSPACE_ARCHIVED');
  if (!access.permissions.includes(permission)) throw new AppError(403, 'FORBIDDEN');
}
