import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ListTodo, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateOnlyRange, formatTime, todayDateOnly } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TaskStatusBadge } from '@/features/tasks/status-badge';
import type { CalendarItem } from '@/types/domain';
import { dayHeading, groupByLocalDay } from './group-by-day';
import { isTaskOverdue } from './task-state';
import type { SelectedCalendarItem } from './calendar-view';

export function ScheduleList({
  items,
  projectNames,
  windowStart,
  onSelectItem,
}: {
  items: CalendarItem[];
  projectNames: Map<string, string>;
  windowStart: string;
  onSelectItem: (item: SelectedCalendarItem) => void;
}) {
  const today = todayDateOnly();
  // A snapshot is enough: whether a meeting has ended doesn't need to tick while the list is open.
  const [nowMs] = useState(() => Date.now());
  const groups = groupByLocalDay(items, windowStart);

  return (
    <div className="space-y-5">
      {groups.map(({ day, items: dayItems }) => {
        const isToday = day === today;
        const isPastDay = day < today;
        return (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h2
              id={`day-${day}`}
              className={cn(
                'mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase',
                isPastDay ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              <time dateTime={day}>{dayHeading(day, today)}</time>
              {isToday && <Badge variant="secondary">Hoy</Badge>}
              {isPastDay && <span className="font-normal normal-case text-muted-foreground">· pasado</span>}
            </h2>
            <ul className="space-y-1.5">
              {dayItems.map((item) => {
                const project = projectNames.get(item.projectId);
                if (item.kind === 'task') {
                  const done = item.status === 'DONE';
                  const overdue = isTaskOverdue({ status: item.status, dueDate: item.end });
                  return (
                    <li key={`task-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => onSelectItem(item)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent',
                          done && 'opacity-60',
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                        ) : (
                          <ListTodo className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm font-medium', done && 'text-muted-foreground line-through')}>
                            <span className="sr-only">Tarea: </span>
                            {item.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {project && <span>{project}</span>}
                            <span>{formatDateOnlyRange(item.start, item.end)}</span>
                            {overdue && (
                              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                                <AlertTriangle className="size-3" aria-hidden="true" /> Atrasada
                              </span>
                            )}
                          </span>
                        </span>
                        <TaskStatusBadge status={item.status} />
                      </button>
                    </li>
                  );
                }
                const ended = Date.parse(item.end) < nowMs;
                return (
                  <li key={`meeting-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/60 p-3 text-left hover:bg-accent',
                        ended && 'opacity-70',
                      )}
                    >
                      <Users className="size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          <span className="sr-only">Reunión: </span>
                          {item.title}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {project && <span>{project}</span>}
                          <span>
                            {formatTime(item.start)} – {formatTime(item.end)}
                          </span>
                        </span>
                      </span>
                      <Badge variant="outline">{ended ? 'Finalizada' : 'Reunión'}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
