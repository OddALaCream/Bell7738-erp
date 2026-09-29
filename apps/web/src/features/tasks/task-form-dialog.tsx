import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { UserAvatar } from '@/components/ui/avatar';
import { ApiError } from '@/lib/api-types';
import { fullName } from '@/lib/utils';
import { useCreateTask, useUpdateTask, useSetTaskAssignees } from './hooks';
import type { ProjectMember, Task } from '@/types/domain';

const schema = z
  .object({
    title: z.string().min(1, 'Ingresa un título.').max(200),
    description: z.string().max(4000).optional(),
    startDate: z.string().min(1, 'Selecciona la fecha de inicio.'),
    dueDate: z.string().min(1, 'Selecciona la fecha de vencimiento.'),
    assigneeIds: z.array(z.string()).min(1, 'Selecciona al menos un asignado.'),
  })
  .refine((data) => data.dueDate >= data.startDate, {
    message: 'El vencimiento no puede ser anterior al inicio.',
    path: ['dueDate'],
  });

type FormValues = z.infer<typeof schema>;

export function TaskFormDialog({
  open,
  onOpenChange,
  projectId,
  members,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: ProjectMember[];
  task?: Task;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <TaskForm projectId={projectId} members={members} task={task} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  projectId,
  members,
  task,
  onOpenChange,
}: {
  projectId: string;
  members: ProjectMember[];
  task?: Task;
  onOpenChange: (open: boolean) => void;
}) {
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId, task?.id ?? '');
  const setAssignees = useSetTaskAssignees(projectId, task?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      startDate: task?.startDate.slice(0, 10) ?? '',
      dueDate: task?.dueDate.slice(0, 10) ?? '',
      assigneeIds: task?.assignees.map((a) => a.userId) ?? [],
    },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (task) {
        await updateTask.mutateAsync({
          title: values.title,
          description: values.description || null,
          startDate: values.startDate,
          dueDate: values.dueDate,
        });
        const original = new Set(task.assignees.map((a) => a.userId));
        const changed =
          original.size !== values.assigneeIds.length || values.assigneeIds.some((id) => !original.has(id));
        if (changed) {
          await setAssignees.mutateAsync(values.assigneeIds);
        }
      } else {
        await createTask.mutateAsync({
          title: values.title,
          description: values.description || undefined,
          startDate: values.startDate,
          dueDate: values.dueDate,
          assigneeIds: values.assigneeIds,
        });
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setFormError(error.message);
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError('No tienes permiso para esta acción.');
      } else {
        setFormError('No se pudo guardar la tarea.');
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{task ? 'Editar tarea' : 'Crear tarea'}</DialogTitle>
        <DialogDescription>Sólo miembros activos del proyecto pueden ser asignados.</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="task-title">Título</Label>
        <Input id="task-title" {...register('title')} aria-invalid={!!errors.title} />
        {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-description">Descripción</Label>
        <Textarea id="task-description" rows={3} {...register('description')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="task-start">Fecha de inicio</Label>
          <Input id="task-start" type="date" {...register('startDate')} aria-invalid={!!errors.startDate} />
          {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-due">Vencimiento</Label>
          <Input id="task-due" type="date" {...register('dueDate')} aria-invalid={!!errors.dueDate} />
          {errors.dueDate && <p className="text-sm text-destructive">{errors.dueDate.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Asignados</Label>
        <Controller
          control={control}
          name="assigneeIds"
          render={({ field }) => (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {members.length === 0 && <p className="text-sm text-muted-foreground">Sin miembros en el proyecto.</p>}
              {members.map((member) => {
                const checked = field.value.includes(member.userId);
                return (
                  <label key={member.userId} className="flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        if (c === true) field.onChange([...field.value, member.userId]);
                        else field.onChange(field.value.filter((id) => id !== member.userId));
                      }}
                    />
                    <UserAvatar firstName={member.user.firstName} lastName={member.user.lastName} className="size-6" />
                    {fullName(member.user)}
                  </label>
                );
              })}
            </div>
          )}
        />
        {errors.assigneeIds && <p className="text-sm text-destructive">{errors.assigneeIds.message}</p>}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {task ? 'Guardar cambios' : 'Crear tarea'}
        </Button>
      </DialogFooter>
    </form>
  );
}
