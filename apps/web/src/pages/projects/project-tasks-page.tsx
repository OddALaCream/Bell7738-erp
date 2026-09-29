import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Circle, ListTodo, Plus } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/common/pagination';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, fullName } from '@/lib/utils';
import { formatDateOnly, isBeforeToday } from '@/lib/dates';
import { toast } from 'sonner';
import { useProjectMembers } from '@/features/projects/hooks';
import { useCompleteTask, useTasks } from '@/features/tasks/hooks';
import { TaskStatusBadge } from '@/features/tasks/status-badge';
import { TaskFormDialog } from '@/features/tasks/task-form-dialog';
import { TaskDetailSheet } from '@/features/tasks/task-detail-sheet';
import { canCompleteTask } from '@/features/tasks/permissions';
import { useAuth } from '@/features/auth/auth-context';
import { TASK_STATUS_LABEL } from '@/features/schedule/task-state';
import type { ProjectDetail, TaskStatus } from '@/types/domain';

const PAGE_SIZE = 50;

export function ProjectTasksPage() {
  const project = useOutletContext<ProjectDetail>();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  const status = (searchParams.get('status') as TaskStatus | null) ?? undefined;
  const assigneeId = searchParams.get('assigneeId') ?? undefined;
  const search = searchParams.get('search') ?? '';
  const dueFrom = searchParams.get('from') ?? undefined;
  const dueTo = searchParams.get('to') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const membersQuery = useProjectMembers(project.id);
  const tasksQuery = useTasks(project.id, {
    status,
    assigneeId,
    search: search || undefined,
    // The API hides DONE tasks unless asked; docs/PRODUCT.md keeps them visible, de-emphasized.
    includeCompleted: true,
    from: dueFrom,
    to: dueTo,
    page,
    pageSize: PAGE_SIZE,
  });
  const completeTask = useCompleteTask(project.id);

  function updateFilter(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function openTask(taskId: string) {
    const next = new URLSearchParams(searchParams);
    next.set('taskId', taskId);
    setSearchParams(next, { replace: true });
  }

  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Buscar tareas…"
            defaultValue={search}
            onBlur={(e) => updateFilter('search', e.target.value || undefined)}
            className="max-w-xs"
          />
          <Select value={status ?? 'ALL'} onValueChange={(v) => updateFilter('status', v === 'ALL' ? undefined : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="PENDING">Pendiente</SelectItem>
              <SelectItem value="IN_PROGRESS">En progreso</SelectItem>
              <SelectItem value="DONE">Terminada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeId ?? 'ALL'} onValueChange={(v) => updateFilter('assigneeId', v === 'ALL' ? undefined : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Asignado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los asignados</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {fullName(m.user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="tasks-from" className="text-xs text-muted-foreground">
              Vence desde
            </Label>
            <Input
              id="tasks-from"
              type="date"
              className="w-36"
              value={dueFrom ?? ''}
              max={dueTo}
              onChange={(e) => updateFilter('from', e.target.value || undefined)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="tasks-to" className="text-xs text-muted-foreground">
              hasta
            </Label>
            <Input
              id="tasks-to"
              type="date"
              className="w-36"
              value={dueTo ?? ''}
              min={dueFrom}
              onChange={(e) => updateFilter('to', e.target.value || undefined)}
            />
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Crear tarea
        </Button>
      </div>

      <QueryState
        query={tasksQuery}
        skeleton={<Skeleton className="h-64 w-full" />}
        emptyWhen={(data) => data.data.length === 0}
        empty={<EmptyState icon={ListTodo} title="Sin tareas para estos filtros" />}
      >
        {(data) => (
          <div className="space-y-3">
            <ul className="space-y-2">
              {data.data.map((task) => {
                const done = task.status === 'DONE';
                const overdue = !done && isBeforeToday(task.dueDate);
                return (
                  <li
                    key={task.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent',
                      done && 'opacity-60',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={done ? 'Terminada' : 'Marcar como completada'}
                      disabled={done || !user || !canCompleteTask(task, user.id, user.isOwner, project.viewerCapabilities.role)}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await completeTask.mutateAsync(task.id);
                        } catch {
                          toast.error('No se pudo completar la tarea.');
                        }
                      }}
                      className="touch-target shrink-0 disabled:cursor-not-allowed"
                    >
                      {done ? (
                        <CheckCircle2 className="size-5 text-brand-600" />
                      ) : (
                        <Circle className="size-5 text-muted-foreground" />
                      )}
                    </button>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openTask(task.id)}>
                      <p className={cn('truncate text-sm font-medium', done && 'text-muted-foreground line-through')}>
                        {task.title}
                      </p>
                      <p className={cn('text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}>
                        Vence {formatDateOnly(task.dueDate)}
                        {overdue && ' · atrasada'}
                        {/* The status badge is hidden on phones; keep the state readable as text there. */}
                        <span className="sm:hidden"> · {TASK_STATUS_LABEL[task.status]}</span>
                      </p>
                    </button>
                    <div className="hidden shrink-0 -space-x-2 sm:flex">
                      {task.assignees.slice(0, 3).map((a) => (
                        <UserAvatar
                          key={a.userId}
                          firstName={a.user.firstName}
                          lastName={a.user.lastName}
                          className="size-7 border-2 border-background"
                        />
                      ))}
                    </div>
                    <div className="hidden shrink-0 sm:block">
                      <TaskStatusBadge status={task.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => updateFilter('page', next > 1 ? String(next) : undefined)}
            />
          </div>
        )}
      </QueryState>

      <TaskFormDialog open={createOpen} onOpenChange={setCreateOpen} projectId={project.id} members={members} />
      <TaskDetailSheet projectId={project.id} members={members} projectRole={project.viewerCapabilities.role} />
    </div>
  );
}
