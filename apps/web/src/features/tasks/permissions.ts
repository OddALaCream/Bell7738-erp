import type { ProjectRole, Task } from '@/types/domain';

/**
 * Client-side approximation of docs/RBAC.md's task rules, used only to
 * decide which buttons to show. The backend re-checks every action for
 * real; this can under-grant for an org-wide override admin (someone with
 * PROJECTS_VIEW_ALL + TASKS_* but no MANAGER membership here and not
 * Owner), because the frontend has no way to know someone's global
 * permission keys — see docs/FRONTEND_BACKEND_GAPS.md's /auth/me gap.
 */
export function canEditTask(
  task: Pick<Task, 'createdById'>,
  currentUserId: string,
  isOwner: boolean,
  projectRole: ProjectRole | null,
): boolean {
  if (isOwner || projectRole === 'MANAGER') return true;
  return task.createdById === currentUserId;
}

export function canCompleteTask(
  task: Pick<Task, 'assignees'>,
  currentUserId: string,
  isOwner: boolean,
  projectRole: ProjectRole | null,
): boolean {
  if (isOwner || projectRole === 'MANAGER') return true;
  return task.assignees.some((assignee) => assignee.userId === currentUserId);
}

export function canReopenOrDeleteTask(isOwner: boolean, projectRole: ProjectRole | null): boolean {
  return isOwner || projectRole === 'MANAGER';
}
