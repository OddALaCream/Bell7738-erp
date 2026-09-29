import { api } from '@/lib/api-client';
import type { Permission, Role, RoleSummary } from '@/types/domain';

/** GET /roles: full Role[] for ROLES_VIEW holders, RoleSummary[] otherwise (docs/RBAC.md). */
export async function listRoles(): Promise<Array<Role | RoleSummary>> {
  return api.get<Array<Role | RoleSummary>>('/roles');
}

export function isFullRole(role: Role | RoleSummary): role is Role {
  return 'permissions' in role;
}

export async function listPermissions(): Promise<Permission[]> {
  return api.get<Permission[]>('/permissions');
}

export async function getRole(roleId: string): Promise<Role> {
  return api.get<Role>(`/roles/${roleId}`);
}

export interface RolePayload {
  name: string;
  description?: string | null;
  color: string;
  position: number;
  permissionIds: string[];
}

export async function createRole(payload: RolePayload): Promise<Role> {
  return api.post<Role>('/roles', payload);
}

export async function updateRole(roleId: string, payload: Partial<RolePayload>): Promise<Role> {
  return api.patch<Role>(`/roles/${roleId}`, payload);
}

export async function deleteRole(roleId: string): Promise<void> {
  await api.delete(`/roles/${roleId}`);
}
