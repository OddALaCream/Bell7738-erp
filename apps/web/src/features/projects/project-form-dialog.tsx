import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api-types';
import { useCreateProject, useUpdateProject } from './hooks';
import type { ProjectStatus, ProjectSummary } from '@/types/domain';

const STATUSES: ProjectStatus[] = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

const schema = z
  .object({
    name: z.string().min(1, 'Ingresa un nombre.').max(200),
    description: z.string().max(4000).optional(),
    clientName: z.string().max(200).optional(),
    status: z.enum(['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const),
    startDate: z.string().optional(),
    expectedEndDate: z.string().optional(),
  })
  .refine((data) => !data.startDate || !data.expectedEndDate || data.expectedEndDate >= data.startDate, {
    message: 'La fecha límite no puede ser anterior al inicio.',
    path: ['expectedEndDate'],
  });

type FormValues = z.infer<typeof schema>;

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectSummary;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <ProjectForm project={project} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ project, onOpenChange }: { project?: ProjectSummary; onOpenChange: (open: boolean) => void }) {
  const createProject = useCreateProject();
  const updateProject = useUpdateProject(project?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      clientName: project?.clientName ?? '',
      status: project?.status ?? 'PLANNED',
      startDate: project?.startDate?.slice(0, 10) ?? '',
      expectedEndDate: project?.expectedEndDate?.slice(0, 10) ?? '',
    },
  });

  const status = watch('status');

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (project) {
        // UpdateProjectDto treats an explicit null as "clear this field".
        await updateProject.mutateAsync({
          name: values.name,
          description: values.description || null,
          clientName: values.clientName || null,
          status: values.status,
          startDate: values.startDate || null,
          expectedEndDate: values.expectedEndDate || null,
        });
      } else {
        // CreateProjectDto rejects null outright — omit empty optional fields instead.
        await createProject.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          clientName: values.clientName || undefined,
          status: values.status,
          startDate: values.startDate || undefined,
          expectedEndDate: values.expectedEndDate || undefined,
        });
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setFormError(error.message);
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError('No tienes permiso para esta acción.');
      } else {
        setFormError('No se pudo guardar el proyecto.');
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{project ? 'Editar proyecto' : 'Crear proyecto'}</DialogTitle>
        <DialogDescription>
          {status === 'COMPLETED' && !project?.completedAt
            ? 'Al marcar como completado se registrará la fecha de finalización.'
            : 'Completa los datos del proyecto.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="project-name">Nombre</Label>
        <Input id="project-name" {...register('name')} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-description">Descripción</Label>
        <Textarea id="project-description" rows={3} {...register('description')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="project-client">Cliente</Label>
          <Input id="project-client" {...register('clientName')} />
        </div>
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={status} onValueChange={(v) => setValue('status', v as ProjectStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="project-start">Fecha de inicio</Label>
          <Input id="project-start" type="date" {...register('startDate')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-end">Fecha límite esperada</Label>
          <Input id="project-end" type="date" {...register('expectedEndDate')} aria-invalid={!!errors.expectedEndDate} />
          {errors.expectedEndDate && <p className="text-sm text-destructive">{errors.expectedEndDate.message}</p>}
        </div>
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
          {project ? 'Guardar cambios' : 'Crear proyecto'}
        </Button>
      </DialogFooter>
    </form>
  );
}
