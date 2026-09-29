import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MoreHorizontal, ShieldCheck, UserPlus, Users as UsersIcon } from 'lucide-react';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { fullName } from '@/lib/utils';
import { RoleBadge } from '@/components/ui/badge';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUsers, useSuspendUser, useReactivateUser, useDisableUser } from '@/features/users/hooks';
import { UserStatusBadge } from '@/features/users/status-badge';
import { EditUserDialog } from '@/features/users/edit-user-dialog';
import { AssignRolesDialog } from '@/features/rbac/assign-roles-dialog';
import { useAssignUserRoles } from '@/features/users/hooks';
import { CreateInvitationDialog } from '@/features/invitations/create-invitation-dialog';
import { InvitationsPanel } from '@/features/invitations/invitations-panel';
import type { AdminUser, UserStatus } from '@/types/domain';
import { useAuth } from '@/features/auth/auth-context';
import { canAny } from '@/lib/permissions';

type PendingAction = { kind: 'suspend' | 'reactivate' | 'disable'; user: AdminUser } | null;

export function AdminUsersPage() {
  useSetBreadcrumb('Administración / Usuarios');
  const { user: actor, can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const status = (searchParams.get('status') as UserStatus | null) ?? undefined;

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [managingRoles, setManagingRoles] = useState<AdminUser | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const usersQuery = useUsers({ search: debouncedSearch || undefined, status, pageSize: 50 });
  const suspendUser = useSuspendUser();
  const reactivateUser = useReactivateUser();
  const disableUser = useDisableUser();
  const assignRoles = useAssignUserRoles(managingRoles?.id ?? '');

  function updateFilter(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const actionConfig: Record<
    NonNullable<PendingAction>['kind'],
    { title: string; description: string; run: (id: string) => Promise<unknown> }
  > = {
    suspend: {
      title: 'Suspender usuario',
      description: 'Se revocarán todas sus sesiones activas de inmediato. Podrá reactivarse más adelante.',
      run: (id) => suspendUser.mutateAsync(id),
    },
    reactivate: {
      title: 'Reactivar usuario',
      description: 'El usuario podrá iniciar sesión nuevamente. No se restauran sus sesiones anteriores.',
      run: (id) => reactivateUser.mutateAsync(id),
    },
    disable: {
      title: 'Deshabilitar usuario',
      description: 'Se revocarán todas sus sesiones activas. Esta acción es más permanente que suspender.',
      run: (id) => disableUser.mutateAsync(id),
    },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Administra cuentas, estados e invitaciones.</p>
        </div>
        {can('USERS_CREATE') && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invitar usuario
          </Button>
        )}
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">
            <UsersIcon className="size-4" /> Usuarios
          </TabsTrigger>
          <TabsTrigger value="invitations">Invitaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Buscar por nombre o email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                updateFilter('search', e.target.value || undefined);
              }}
              className="max-w-xs"
            />
            <Select value={status ?? 'ALL'} onValueChange={(v) => updateFilter('status', v === 'ALL' ? undefined : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los estados</SelectItem>
                <SelectItem value="INVITED">Invitado</SelectItem>
                <SelectItem value="ACTIVE">Activo</SelectItem>
                <SelectItem value="SUSPENDED">Suspendido</SelectItem>
                <SelectItem value="DISABLED">Deshabilitado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <QueryState
            query={usersQuery}
            skeleton={<Skeleton className="h-64 w-full" />}
            emptyWhen={(data) => data.data.length === 0}
            empty={
              <EmptyState
                icon={UsersIcon}
                title={debouncedSearch || status ? 'Sin resultados' : 'Aún no hay usuarios'}
              />
            }
          >
            {(data) => (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden md:table-cell">Roles</TableHead>
                      <TableHead className="hidden sm:table-cell">Último acceso</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar firstName={row.firstName} lastName={row.lastName} />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                {fullName(row)}
                                {row.isOwner && <ShieldCheck className="size-3.5 text-brand-600" aria-label="Owner" />}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <UserStatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {row.roles.length === 0 ? (
                              <span className="text-xs text-muted-foreground">{row.isOwner ? 'Owner' : 'Sin roles'}</span>
                            ) : (
                              row.roles.map((role) => <RoleBadge key={role.id} name={role.name} color={role.color} />)
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          {!row.isOwner && row.id !== actor?.id && canAny(can, 'USERS_UPDATE', 'USERS_ROLES_MANAGE', 'USERS_DISABLE') && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Acciones">
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {can('USERS_UPDATE') && (
                                  <DropdownMenuItem onSelect={() => setEditing(row)}>Editar datos</DropdownMenuItem>
                                )}
                                {can('USERS_ROLES_MANAGE') && (
                                  <DropdownMenuItem onSelect={() => setManagingRoles(row)}>
                                    Administrar roles
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {can('USERS_DISABLE') && row.status === 'ACTIVE' && (
                                  <DropdownMenuItem onSelect={() => setPendingAction({ kind: 'suspend', user: row })}>
                                    Suspender
                                  </DropdownMenuItem>
                                )}
                                {can('USERS_UPDATE') && row.status === 'SUSPENDED' && (
                                  <DropdownMenuItem onSelect={() => setPendingAction({ kind: 'reactivate', user: row })}>
                                    Reactivar
                                  </DropdownMenuItem>
                                )}
                                {can('USERS_DISABLE') && (row.status === 'ACTIVE' || row.status === 'SUSPENDED') && (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setPendingAction({ kind: 'disable', user: row })}
                                  >
                                    Deshabilitar
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {row.isOwner && (
                            <span className="text-xs text-muted-foreground" title="El Owner no puede administrarse desde aquí">
                              Owner
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="invitations">
          <InvitationsPanel />
        </TabsContent>
      </Tabs>

      <EditUserDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)} user={editing} />

      <AssignRolesDialog
        open={!!managingRoles}
        onOpenChange={(open) => !open && setManagingRoles(null)}
        user={managingRoles}
        onSubmit={(roleIds) => assignRoles.mutateAsync(roleIds)}
      />

      <CreateInvitationDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <ConfirmDialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={pendingAction ? actionConfig[pendingAction.kind].title : ''}
        description={pendingAction ? actionConfig[pendingAction.kind].description : ''}
        confirmLabel={pendingAction ? actionConfig[pendingAction.kind].title.split(' ')[0] : 'Confirmar'}
        variant={pendingAction?.kind === 'reactivate' ? 'default' : 'destructive'}
        onConfirm={async () => {
          if (!pendingAction) return;
          await actionConfig[pendingAction.kind].run(pendingAction.user.id);
        }}
      />
    </div>
  );
}
