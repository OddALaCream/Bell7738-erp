import { AlertTriangle } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { formatDateOnlyRange } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TaskStatusBadge } from '@/features/tasks/status-badge';
import type { TimelineTask } from './api';
import { isTaskOverdue } from './task-state';

/** Accessible, mobile-friendly alternative to the bar chart (docs/UI-UX.md: "alternativa de lista accesible"). */
export function TimelineList({ tasks, onSelectTask }: { tasks: TimelineTask[]; onSelectTask: (taskId: string) => void }) {
  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const done = task.status === 'DONE';
        const overdue = isTaskOverdue(task);
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onSelectTask(task.id)}
              className={cn(
                'flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border p-3 text-left hover:bg-accent',
                done && 'opacity-60',
              )}
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className={cn('block truncate text-sm font-medium', done && 'text-muted-foreground line-through')}>
                  {task.title}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {formatDateOnlyRange(task.startDate, task.dueDate)}
                  {overdue && (
                    <span className="inline-flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangle className="size-3" aria-hidden="true" /> Atrasada
                    </span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="flex -space-x-1.5">
                  {task.assignees.slice(0, 3).map((assignee) => (
                    <UserAvatar
                      key={assignee.userId}
                      firstName={assignee.user.firstName}
                      lastName={assignee.user.lastName}
                      className="size-6 border border-background"
                    />
                  ))}
                </span>
                <TaskStatusBadge status={task.status} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
