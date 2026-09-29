import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RoleBadge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-types';
import { useRoles } from './hooks';
import type { AdminUser } from '@/types/domain';

/**
 * `PUT /users/:id/roles` replaces the complete set, so the dialog opens with
 * the roles the person really has (from the admin user response) already
 * checked: saving without touching anything changes nothing, and only what the
 * admin unchecks is removed.
 */
export function AssignRolesDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  onSubmit: (roleIds: string[]) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted fresh each time the dialog opens, so its selection/error
            state never needs to be reset via an effect — see docs on
            "resetting state when a prop changes" (key/remount, not effects). */}
        {open && <AssignRolesForm user={user} onOpenChange={onOpenChange} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  );
}

function AssignRolesForm({
  user,
  onOpenChange,
  onSubmit,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (roleIds: string[]) => Promise<unknown>;
}) {
  const rolesQuery = useRoles();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(user?.roles.map((role) => role.id) ?? []));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(roleId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(roleId);
      else next.delete(roleId);
      return next;
    });
  }

  async function handleSubmit() {
    setPending(true);
    setError(null);
    try {
      await onSubmit(Array.from(selected));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('No puedes conceder un rol con permisos que tú mismo no tienes.');
      } else {
        setError('No se pudieron actualizar los roles.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Roles de {user ? `${user.firstName} ${user.lastName}` : ''}</DialogTitle>
        <DialogDescription>Selecciona el conjunto completo de roles para este usuario.</DialogDescription>
      </DialogHeader>

      <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          Los roles que <strong>ya tiene</strong> aparecen marcados. Al guardar se reemplaza el conjunto completo: los
          roles que desmarques se retiran y los que marques se añaden.
        </p>
      </div>

      {rolesQuery.isPending && <p className="text-sm text-muted-foreground">Cargando roles…</p>}
      {rolesQuery.data && (
        <div className="space-y-1.5">
          {rolesQuery.data.map((role) => (
            <label key={role.id} className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-accent">
              <Checkbox checked={selected.has(role.id)} onCheckedChange={(c) => toggle(role.id, c === true)} />
              <RoleBadge name={role.name} color={role.color} />
            </label>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleSubmit} loading={pending}>
          Guardar roles
        </Button>
      </DialogFooter>
    </>
  );
}
