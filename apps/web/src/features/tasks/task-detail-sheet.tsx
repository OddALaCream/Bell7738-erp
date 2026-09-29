import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { QueryErrorState } from '@/components/common/query-state';
import { useAuth } from '@/features/auth/auth-context';
import { fullName } from '@/lib/utils';
import { formatDateOnly } from '@/lib/dates';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-types';
import { useCompleteTask, useDeleteTask, useReopenTask, useTask } from './hooks';
import { canCompleteTask, canDeleteTask, canEditTask, canReopenTask } from './permissions';
import { TaskStatusBadge } from './status-badge';
import { TaskFormDialog } from './task-form-dialog';
import type { ProjectMember, ProjectRole } from '@/types/domain';

export function TaskDetailSheet({
  projectId,
  members,
  projectRole,
}: {
  projectId: string;
  members: ProjectMember[];
  projectRole: ProjectRole | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const taskId = searchParams.get('taskId') ?? undefined;
  const { user, can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const taskQuery = useTask(projectId, taskId);
  const completeTask = useCompleteTask(projectId);
  const reopenTask = useReopenTask(projectId);
  const deleteTask = useDeleteTask(projectId);

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete('taskId');
    setSearchParams(next, { replace: true });
  }

  const task = taskQuery.data;

  return (
    <>
      <Sheet open={!!taskId} onOpenChange={(open) => !open && close()}>
        <SheetContent>
          {taskQuery.isPending && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {taskQuery.isError && <QueryErrorState error={taskQuery.error} onRetry={() => taskQuery.refetch()} />}
          {task && user && (
            <>
              <SheetHeader>
                <SheetTitle className={task.status === 'DONE' ? 'text-muted-foreground line-through' : undefined}>
                  {task.title}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <TaskStatusBadge status={task.status} />
                {task.description && <p className="whitespace-pre-wrap text-muted-foreground">{task.description}</p>}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Inicio: {formatDateOnly(task.startDate)}</span>
                  <span>Vencimiento: {formatDateOnly(task.dueDate)}</span>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Asignados</p>
                  <div className="flex flex-wrap gap-2">
                    {task.assignees.map((assignee) => (
                      <div key={assignee.userId} className="flex items-center gap-1.5">
                        <UserAvatar
                          firstName={assignee.user.firstName}
                          lastName={assignee.user.lastName}
                          className="size-6"
                        />
                        <span className="text-xs">{fullName(assignee.user)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <SheetFooter>
                {task.status !== 'DONE' && canCompleteTask(task, user.id, can, projectRole) && (
                  <Button
                    onClick={async () => {
                      try {
                        await completeTask.mutateAsync(task.id);
                      } catch {
                        toast.error('No se pudo completar la tarea.');
                      }
                    }}
                  >
                    <CheckCircle2 /> Completar
                  </Button>
                )}
                {task.status === 'DONE' && canReopenTask(can, projectRole) && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await reopenTask.mutateAsync(task.id);
                      } catch {
                        toast.error('No se pudo reabrir la tarea.');
                      }
                    }}
                  >
                    <RotateCcw /> Reabrir
                  </Button>
                )}
                {task.status !== 'DONE' && canEditTask(task, user.id, can, projectRole) && (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil /> Editar
                  </Button>
                )}
                {canDeleteTask(can, projectRole) && (
                  <Button variant="outline" onClick={() => setDeleting(true)}>
                    <Trash2 className="text-destructive" /> Eliminar
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {task && (
        <TaskFormDialog open={editing} onOpenChange={setEditing} projectId={projectId} members={members} task={task} />
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Eliminar tarea"
        description={<>Se eliminará la tarea <strong>{task?.title}</strong> de forma lógica.</>}
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (!task) return;
          try {
            await deleteTask.mutateAsync(task.id);
            close();
          } catch (error) {
            if (error instanceof ApiError) toast.error(error.message);
            else toast.error('No se pudo eliminar la tarea.');
          }
        }}
      />
    </>
  );
}
