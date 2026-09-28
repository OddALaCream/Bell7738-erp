import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { RoleBadge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-types';
import { useRoles } from '@/features/rbac/hooks';
import { useCreateInvitation } from './hooks';

const schema = z.object({
  email: z.string().min(1, 'Ingresa un email.').email('Ingresa un email válido.'),
  firstName: z.string().min(1, 'Ingresa un nombre.').max(200),
  lastName: z.string().min(1, 'Ingresa un apellido.').max(200),
  roleIds: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export function CreateInvitationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const rolesQuery = useRoles();
  const createInvitation = useCreateInvitation();
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { roleIds: [] } });

  useEffect(() => {
    if (open) {
      reset({ email: '', firstName: '', lastName: '', roleIds: [] });
      setManualLink(null);
      setFormError(null);
      setCopied(false);
    }
  }, [open, reset]);

  const selectedRoleIds = watch('roleIds');

  function toggleRole(roleId: string, checked: boolean) {
    const current = new Set(selectedRoleIds);
    if (checked) current.add(roleId);
    else current.delete(roleId);
    setValue('roleIds', Array.from(current));
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const result = await createInvitation.mutateAsync(values);
      setManualLink(result.manualLink);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFormError('Ya existe una cuenta con ese email.');
      } else if (error instanceof ApiError) {
        setFormError(error.fieldMessage('email') ?? error.message);
      } else {
        setFormError('No se pudo crear la invitación.');
      }
    }
  }

  async function copyLink() {
    if (!manualLink) return;
    try {
      await navigator.clipboard.writeText(manualLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently; the link stays visible to copy manually.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            {manualLink
              ? 'Copia este enlace ahora — no volverá a mostrarse.'
              : 'Se creará la cuenta en estado invitado con los roles seleccionados.'}
          </DialogDescription>
        </DialogHeader>

        {manualLink ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{manualLink}</code>
              <Button type="button" variant="ghost" size="icon" onClick={copyLink} aria-label="Copiar enlace">
                {copied ? <Check className="text-brand-600" /> : <Copy />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Si más adelante se configura SMTP, este enlace se enviará por correo automáticamente.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-firstName">Nombre</Label>
                <Input id="invite-firstName" {...register('firstName')} aria-invalid={!!errors.firstName} />
                {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-lastName">Apellido</Label>
                <Input id="invite-lastName" {...register('lastName')} aria-invalid={!!errors.lastName} />
                {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" {...register('email')} aria-invalid={!!errors.email} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Roles iniciales</Label>
              {rolesQuery.data && (
                <div className="flex flex-wrap gap-2">
                  {rolesQuery.data.map((role) => (
                    <label key={role.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={selectedRoleIds.includes(role.id)}
                        onCheckedChange={(c) => toggleRole(role.id, c === true)}
                      />
                      <RoleBadge name={role.name} color={role.color} />
                    </label>
                  ))}
                </div>
              )}
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
                Crear invitación
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
