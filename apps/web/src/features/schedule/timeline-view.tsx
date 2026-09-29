import { Fragment, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Circle, PlayCircle } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { addDays, diffInDays, formatDateOnly, formatDateOnlyRange, todayDateOnly, toDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { TimelineTask } from './api';
import { isTaskOverdue, TASK_STATUS_LABEL } from './task-state';

const COLUMN_WIDTH = 36;
const MIN_DAYS = 14;
const MAX_VISIBLE_AVATARS = 3;

/**
 * docs/UI-UX.md: a simple day-by-day bar chart ("no un Gantt empresarial"),
 * not FullCalendar. The bars are a visual aid only (aria-hidden); the
 * task-name buttons and the list alternative carry the accessible content.
 */
export function TimelineView({ tasks, onSelectTask }: { tasks: TimelineTask[]; onSelectTask: (taskId: string) => void }) {
  const today = todayDateOnly();

  const { firstDay, days } = useMemo(() => {
    const starts = tasks.map((task) => toDateOnly(task.startDate)).sort();
    const ends = tasks.map((task) => toDateOnly(task.dueDate)).sort();
    const first = starts[0] ?? todayDateOnly();
    const last = ends[ends.length - 1] ?? first;
    return { firstDay: first, days: Math.max(MIN_DAYS, diffInDays(first, last) + 1) };
  }, [tasks]);

  const dayCells = useMemo(
    () =>
      Array.from({ length: days }, (_, index) => {
        const date = addDays(firstDay, index);
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        return { date, weekend: weekday === 0 || weekday === 6, isMonthStart: date.endsWith('-01') || index === 0 };
      }),
    [firstDay, days],
  );

  const todayOffset = diffInDays(firstDay, today);
  const todayVisible = todayOffset >= 0 && todayOffset < days;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div
        className="grid text-xs [--label-w:9.5rem] sm:[--label-w:15rem]"
        style={{
          gridTemplateColumns: `var(--label-w) repeat(${days}, ${COLUMN_WIDTH}px)`,
          minWidth: `calc(var(--label-w) + ${days * COLUMN_WIDTH}px)`,
        }}
      >
        <div className="sticky left-0 z-20 border-b border-r border-border bg-background p-2 font-medium">Tarea</div>
        {dayCells.map((cell) => (
          <div
            key={cell.date}
            className={cn(
              'border-b border-border p-1 text-center text-muted-foreground',
              cell.weekend && 'bg-muted/50',
              cell.date === today && 'bg-accent font-semibold text-accent-foreground',
            )}
          >
            <div className="h-3 text-[10px] uppercase leading-3">
              {cell.isMonthStart ? formatDateOnly(cell.date, { month: 'short' }) : ''}
            </div>
            <div>{formatDateOnly(cell.date, { day: '2-digit' })}</div>
          </div>
        ))}

        {tasks.map((task) => {
          const done = task.status === 'DONE';
          const overdue = isTaskOverdue(task);
          const startOffset = diffInDays(firstDay, task.startDate);
          const span = Math.max(1, diffInDays(task.startDate, task.dueDate) + 1);
          const StatusIcon = done ? CheckCircle2 : overdue ? AlertTriangle : task.status === 'IN_PROGRESS' ? PlayCircle : Circle;

          return (
            <Fragment key={task.id}>
              <button
                type="button"
                onClick={() => onSelectTask(task.id)}
                className={cn(
                  'sticky left-0 z-10 flex items-center gap-1.5 border-b border-r border-border bg-background p-2 text-left hover:bg-accent',
                  done && 'opacity-60',
                )}
              >
                <StatusIcon
                  className={cn('size-4 shrink-0', overdue ? 'text-destructive' : done ? 'text-brand-600' : 'text-muted-foreground')}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className={cn('block truncate text-xs font-medium', done && 'text-muted-foreground line-through')}>
                    {task.title}
                  </span>
                  {overdue && <span className="block text-[10px] font-medium text-destructive">Atrasada</span>}
                  <span className="sr-only">
                    {TASK_STATUS_LABEL[task.status]}, {formatDateOnlyRange(task.startDate, task.dueDate)}
                    {overdue ? ', atrasada' : ''}
                  </span>
                </span>
              </button>
              <div
                className="relative border-b border-border py-2"
                style={{ gridColumn: `2 / span ${days}`, minHeight: 40 }}
              >
                {todayVisible && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 w-px bg-primary/50"
                    style={{ left: todayOffset * COLUMN_WIDTH + COLUMN_WIDTH / 2 }}
                  />
                )}
                <div
                  aria-hidden="true"
                  onClick={() => onSelectTask(task.id)}
                  className={cn(
                    'absolute top-1/2 flex h-5 -translate-y-1/2 cursor-pointer items-center rounded-full px-1',
                    done && 'bg-brand-600 text-primary-foreground opacity-40',
                    overdue && 'bg-destructive text-destructive-foreground',
                    !done && !overdue && task.status === 'IN_PROGRESS' && 'bg-brand-600 text-primary-foreground',
                    !done && !overdue && task.status === 'PENDING' && 'border-2 border-brand-600 bg-brand-50 text-brand-700',
                  )}
                  style={{ left: startOffset * COLUMN_WIDTH + 2, width: span * COLUMN_WIDTH - 4 }}
                >
                  <StatusIcon className="size-3.5 shrink-0" />
                </div>
                <div
                  className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 -space-x-1.5"
                  style={{ left: (startOffset + span) * COLUMN_WIDTH + 4 }}
                >
                  {task.assignees.slice(0, MAX_VISIBLE_AVATARS).map((assignee) => (
                    <UserAvatar
                      key={assignee.userId}
                      firstName={assignee.user.firstName}
                      lastName={assignee.user.lastName}
                      className="size-5 border border-background"
                    />
                  ))}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
