import { canManageInProject, canWriteInProject, type Can } from '@/lib/permissions';
import type { ProjectRole, Task } from '@/types/domain';

/**
 * docs/RBAC.md's task rules as UX hints, driven by the permissions the backend
 * reports for this person (`GET /auth/me`) and their role in the project. They
 * only decide which buttons to show; the API re-checks every action for real,
 * including the creator/assignee relation.
 */
export function canCreateTask(can: Can, projectRole: ProjectRole | null): boolean {
  return canWriteInProject(can, 'TASKS_CREATE', projectRole);
}

export function canEditTask(
  task: Pick<Task, 'createdById'>,
  currentUserId: string,
  can: Can,
  projectRole: ProjectRole | null,
): boolean {
  if (canManageInProject(can, 'TASKS_UPDATE', projectRole)) return true;
  return can('TASKS_UPDATE') && projectRole === 'MEMBER' && task.createdById === currentUserId;
}

export function canCompleteTask(
  task: Pick<Task, 'assignees'>,
  currentUserId: string,
  can: Can,
  projectRole: ProjectRole | null,
): boolean {
  if (canManageInProject(can, 'TASKS_COMPLETE', projectRole)) return true;
  return (
    can('TASKS_COMPLETE') &&
    projectRole === 'MEMBER' &&
    task.assignees.some((assignee) => assignee.userId === currentUserId)
  );
}

export function canReopenTask(can: Can, projectRole: ProjectRole | null): boolean {
  return canManageInProject(can, 'TASKS_UPDATE', projectRole);
}

export function canDeleteTask(can: Can, projectRole: ProjectRole | null): boolean {
  return canManageInProject(can, 'TASKS_DELETE', projectRole);
}
