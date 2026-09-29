import type { ProjectRole } from '@startup-erp/shared';

/**
 * The permission keys the UI asks about (docs/RBAC.md catalog). Presentation
 * only: `GET /auth/me` says which of them the person holds, and every request
 * is authorized again by the API. Typing them keeps a typo from silently hiding
 * a control.
 */
export type PermissionKey =
  | 'DASHBOARD_VIEW'
  | 'PROJECTS_VIEW_ASSIGNED'
  | 'PROJECTS_VIEW_ALL'
  | 'PROJECTS_CREATE'
  | 'PROJECTS_UPDATE'
  | 'PROJECTS_DELETE'
  | 'PROJECT_MEMBERS_MANAGE'
  | 'TASKS_CREATE'
  | 'TASKS_UPDATE'
  | 'TASKS_DELETE'
  | 'TASKS_COMPLETE'
  | 'MEETINGS_CREATE'
  | 'MEETINGS_UPDATE'
  | 'MEETINGS_DELETE'
  | 'DOCUMENTS_UPLOAD'
  | 'DOCUMENTS_DELETE'
  | 'USERS_VIEW'
  | 'USERS_CREATE'
  | 'USERS_UPDATE'
  | 'USERS_DISABLE'
  | 'USERS_ROLES_MANAGE'
  | 'ROLES_VIEW'
  | 'ROLES_MANAGE'
  | 'AUDIT_VIEW';

export type Can = (...keys: PermissionKey[]) => boolean;

/** True when the person holds every given key. */
export function makeCan(permissions: readonly string[] | undefined): Can {
  const held = new Set(permissions ?? []);
  return (...keys) => keys.every((key) => held.has(key));
}

/** True when the person holds at least one of the keys. */
export function canAny(can: Can, ...keys: PermissionKey[]): boolean {
  return keys.some((key) => can(key));
}

/**
 * docs/RBAC.md, "Rol local de proyecto" + "Override organizacional", as a UX
 * hint: the action permission plus being MEMBER/MANAGER of the project, or
 * holding PROJECTS_VIEW_ALL (the organization-wide override; the Owner's
 * catalog includes it). The API makes the real decision on every request.
 */
export function canWriteInProject(can: Can, key: PermissionKey, role: ProjectRole | null): boolean {
  return can(key) && (can('PROJECTS_VIEW_ALL') || role === 'MEMBER' || role === 'MANAGER');
}

/** Same, but for actions reserved to a project's MANAGER (or the override). */
export function canManageInProject(can: Can, key: PermissionKey, role: ProjectRole | null): boolean {
  return can(key) && (can('PROJECTS_VIEW_ALL') || role === 'MANAGER');
}
