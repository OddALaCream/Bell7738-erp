import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RoleBadge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api-types';
import { toast } from 'sonner';
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from '@/features/rbac/hooks';
import { isFullRole, type RolePayload } from '@/features/rbac/api';
import { RoleFormDialog } from '@/features/rbac/role-form-dialog';
import type { Role, RoleSummary } from '@/types/domain';

export function AdminRolesPage() {
  useSetBreadcrumb('Administración / Roles');
  const rolesQuery = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const [editing, setEditing] = useState<Role | RoleSummary | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Role | RoleSummary | null>(null);
  const deleteRole = useDeleteRole();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Roles</h1>
          <p className="text-sm text-muted-foreground">Agrupaciones configurables de permisos.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus /> Crear rol
        </Button>
      </div>

      <QueryState
        query={rolesQuery}
        emptyWhen={(data) => data.length === 0}
        empty={<EmptyState icon={ShieldCheck} title="Aún no hay roles configurados" />}
      >
        {(roles) => (
          <div className="space-y-2">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <RoleBadge name={role.name} color={role.color} />
                    {isFullRole(role) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {role.permissions.length} permiso{role.permissions.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar rol" onClick={() => setEditing(role)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Eliminar rol"
                      onClick={() => setDeleting(role)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>

      <RoleFormDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        role={editing && isFullRole(editing) ? editing : null}
        onSubmit={async (values: RolePayload) => {
          if (editing) await updateRole.mutateAsync({ roleId: editing.id, payload: values });
          else await createRole.mutateAsync(values);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar rol"
        description={
          <>
            Se eliminará el rol <strong>{deleting?.name}</strong>. Si está asignado a algún usuario, la operación
            se rechazará hasta que quites esas asignaciones.
          </>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteRole.mutateAsync(deleting.id);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              toast.error('Este rol está asignado a usuarios o invitaciones. Quita esas asignaciones primero.');
            } else {
              toast.error('No se pudo eliminar el rol.');
            }
          }
        }}
      />
    </div>
  );
}
