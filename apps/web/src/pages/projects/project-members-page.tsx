import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MoreHorizontal, UserPlus, Users } from 'lucide-react';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError } from '@/lib/api-types';
import { toast } from 'sonner';
import { fullName } from '@/lib/utils';
import {
  useProjectMembers,
  useRemoveProjectMember,
  useUpdateProjectMemberRole,
} from '@/features/projects/hooks';
import { AddMemberDialog } from '@/features/projects/add-member-dialog';
import type { ProjectDetail, ProjectMember, ProjectRole } from '@/types/domain';

const ROLE_ORDER: ProjectRole[] = ['MANAGER', 'MEMBER', 'VIEWER'];

export function ProjectMembersPage() {
  const project = useOutletContext<ProjectDetail>();
  const membersQuery = useProjectMembers(project.id);
  const updateRole = useUpdateProjectMemberRole(project.id);
  const removeMember = useRemoveProjectMember(project.id);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);

  const canManage = project.viewerCapabilities.canManageMembers;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus /> Añadir miembro
          </Button>
        </div>
      )}

      <QueryState
        query={membersQuery}
        emptyWhen={(data) => data.length === 0}
        empty={<EmptyState icon={Users} title="Sin miembros" />}
      >
        {(members) => (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar firstName={member.user.firstName} lastName={member.user.lastName} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fullName(member.user)}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={member.role === 'MANAGER' ? 'success' : 'secondary'}>{member.role}</Badge>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Acciones">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {ROLE_ORDER.filter((r) => r !== member.role).map((r) => (
                          <DropdownMenuItem
                            key={r}
                            onSelect={async () => {
                              try {
                                await updateRole.mutateAsync({ userId: member.userId, role: r });
                              } catch (error) {
                                if (error instanceof ApiError && error.status === 409) {
                                  toast.error('No puedes dejar el proyecto sin un manager activo.');
                                } else {
                                  toast.error('No se pudo cambiar el rol.');
                                }
                              }
                            }}
                          >
                            Cambiar a {r}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(member)}>
                          Retirar del proyecto
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryState>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={project.id}
        existingUserIds={new Set((membersQuery.data ?? []).map((m) => m.userId))}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Retirar miembro"
        description={
          <>
            <strong>{removing ? fullName(removing.user) : ''}</strong> perderá acceso al proyecto. Sus tareas y
            reuniones asignadas seguirán existiendo y deberán reasignarse si corresponde.
          </>
        }
        confirmLabel="Retirar"
        variant="destructive"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeMember.mutateAsync(removing.userId);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              toast.error('No puedes retirar al último manager activo del proyecto.');
            } else {
              toast.error('No se pudo retirar al miembro.');
            }
          }
        }}
      />
    </div>
  );
}
