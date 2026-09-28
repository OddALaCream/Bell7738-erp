import { isBeforeToday } from '@/lib/dates';
import type { TaskStatus } from '@/types/domain';

/** An unfinished task whose due date is before today. A task due today is not overdue. */
export function isTaskOverdue(task: { status: TaskStatus; dueDate: string }): boolean {
  return task.status !== 'DONE' && isBeforeToday(task.dueDate);
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  DONE: 'Terminada',
};
