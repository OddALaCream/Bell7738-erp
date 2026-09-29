import { useState } from 'react';
import { Check, Copy, MailPlus, MoreHorizontal, Send, XCircle } from 'lucide-react';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@/components/common/empty-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useInvitations, useResendInvitation, useRevokeInvitation } from './hooks';
import { InvitationStatusBadge } from './status-badge';
import { fullName } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import type { Invitation } from '@/types/domain';

export function InvitationsPanel() {
  const { can } = useAuth();
  const invitationsQuery = useInvitations({ pageSize: 50 });
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const [revoking, setRevoking] = useState<Invitation | null>(null);

  async function handleResend(invitation: Invitation) {
    try {
      const result = await resend.mutateAsync(invitation.id);
      try {
        await navigator.clipboard.writeText(result.manualLink);
        toast.success('Nueva invitación creada. Enlace copiado al portapapeles.', {
          icon: <Check className="size-4" />,
        });
      } catch {
        toast.success('Nueva invitación creada.', {
          description: result.manualLink,
          icon: <Copy className="size-4" />,
        });
      }
    } catch {
      toast.error('No se pudo reenviar la invitación.');
    }
  }

  return (
    <div className="space-y-4">
      <QueryState
        query={invitationsQuery}
        emptyWhen={(data) => data.data.length === 0}
        empty={<EmptyState icon={MailPlus} title="No hay invitaciones" />}
      >
        {(data) => (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invitado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Expira</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{fullName(invitation)}</p>
                      <p className="text-xs text-muted-foreground">{invitation.email}</p>
                    </TableCell>
                    <TableCell>
                      <InvitationStatusBadge status={invitation.status} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {invitation.status === 'pending' && can('USERS_CREATE') && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Acciones">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => handleResend(invitation)}>
                              <Send /> Reenviar
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setRevoking(invitation)}>
                              <XCircle /> Revocar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryState>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revocar invitación"
        description={
          <>
            La invitación para <strong>{revoking ? fullName(revoking) : ''}</strong> dejará de ser válida.
          </>
        }
        confirmLabel="Revocar"
        variant="destructive"
        onConfirm={async () => {
          if (revoking) await revoke.mutateAsync(revoking.id);
        }}
      />
    </div>
  );
}
