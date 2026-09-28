import { useEffect, useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { ApiError } from '@/lib/api-types';
import { usePermissions } from './hooks';
import { groupPermissionsByDomain } from './permission-domains';
import type { Role } from '@/types/domain';

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const schema = z.object({
  name: z.string().min(1, 'Ingresa un nombre.').max(100),
  description: z.string().max(1000).optional(),
  color: z.string().regex(HEX_PATTERN, 'Usa un color hex, ej. #336699'),
  position: z.number().int().min(0),
  permissionIds: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSubmit: (values: FormValues) => Promise<unknown>;
}) {
  const permissionsQuery = usePermissions();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', color: '#4b7c4b', position: 0, permissionIds: [] },
  });

  useEffect(() => {
    if (open) {
      reset(
        role
          ? {
              name: role.name,
              description: role.description ?? '',
              color: role.color,
              position: role.position,
              permissionIds: role.permissions.map((p) => p.id),
            }
          : { name: '', description: '', color: '#4b7c4b', position: 0, permissionIds: [] },
      );
      setFormError(null);
    }
  }, [open, role, reset]);

  const selectedIds = watch('permissionIds');
  const color = watch('color');

  function togglePermission(id: string, checked: boolean) {
    const current = new Set(selectedIds);
    if (checked) current.add(id);
    else current.delete(id);
    setValue('permissionIds', Array.from(current), { shouldDirty: true });
  }

  async function handleFormSubmit(values: FormValues) {
    setFormError(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFormError('Ya existe un rol con ese nombre.');
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError('No puedes conceder permisos que tú mismo no tienes.');
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('No se pudo guardar el rol.');
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? 'Editar rol' : 'Crear rol'}</DialogTitle>
          <DialogDescription>
            Los permisos determinan qué puede hacer este rol. Sólo puedes conceder permisos que ya posees.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Nombre</Label>
              <Input id="role-name" {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-position">Posición</Label>
              <Input
                id="role-position"
                type="number"
                min={0}
                {...register('position', { valueAsNumber: true })}
              />
              {errors.position && <p className="text-sm text-destructive">{errors.position.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-description">Descripción</Label>
            <Textarea id="role-description" rows={2} {...register('description')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-color">Color</Label>
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <input
                    type="color"
                    value={HEX_PATTERN.test(field.value) ? field.value : '#4b7c4b'}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input"
                    aria-label="Selector de color"
                  />
                )}
              />
              <Input id="role-color" {...register('color')} className="max-w-32" />
              <span
                className="rounded-md border px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: HEX_PATTERN.test(color) ? color : undefined }}
              >
                Vista previa
              </span>
            </div>
            {errors.color && <p className="text-sm text-destructive">{errors.color.message}</p>}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Permisos</Label>
            {permissionsQuery.isPending && <p className="text-sm text-muted-foreground">Cargando permisos…</p>}
            {permissionsQuery.data &&
              groupPermissionsByDomain(permissionsQuery.data).map(([domain, permissions]) => (
                <div key={domain} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{domain}</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {permissions.map((permission) => (
                      <label key={permission.id} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={selectedIds.includes(permission.id)}
                          onCheckedChange={(checked) => togglePermission(permission.id, checked === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium">{permission.key}</span>
                          <span className="block text-xs text-muted-foreground">{permission.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
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
              {role ? 'Guardar cambios' : 'Crear rol'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
