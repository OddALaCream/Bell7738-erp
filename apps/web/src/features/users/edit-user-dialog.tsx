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
import { ApiError } from '@/lib/api-types';
import { useUpdateUser } from './hooks';
import type { AdminUser } from '@/types/domain';

const schema = z.object({
  firstName: z.string().min(1, 'Ingresa un nombre.').max(200),
  lastName: z.string().min(1, 'Ingresa un apellido.').max(200),
  email: z.string().min(1, 'Ingresa un email.').email('Ingresa un email válido.'),
});

type FormValues = z.infer<typeof schema>;

export function EditUserDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted fresh each time, so the form's default values never need
            resetting via an effect when a different user is edited. */}
        {open && user && <EditUserForm user={user} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({ user, onOpenChange }: { user: AdminUser; onOpenChange: (open: boolean) => void }) {
  const updateUser = useUpdateUser(user.id);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user.firstName, lastName: user.lastName, email: user.email },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await updateUser.mutateAsync(values);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFormError('Ya existe una cuenta con ese email.');
      } else if (error instanceof ApiError) {
        setFormError(error.fieldMessage('email') ?? error.message);
      } else {
        setFormError('No se pudo guardar los cambios.');
      }
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar usuario</DialogTitle>
        <DialogDescription>Cambiar el email revoca todas las sesiones activas del usuario.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-firstName">Nombre</Label>
            <Input id="edit-firstName" {...register('firstName')} aria-invalid={!!errors.firstName} />
            {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-lastName">Apellido</Label>
            <Input id="edit-lastName" {...register('lastName')} aria-invalid={!!errors.lastName} />
            {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-email">Email</Label>
          <Input id="edit-email" type="email" {...register('email')} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
            Guardar cambios
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
