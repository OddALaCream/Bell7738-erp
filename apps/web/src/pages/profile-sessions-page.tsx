import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Laptop, LogOut, MonitorSmartphone, ShieldX } from 'lucide-react';
import * as authApi from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { useSetBreadcrumb } from '@/components/layout/breadcrumb-context';
import { QueryState } from '@/components/common/query-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { Session } from '@/types/domain';

export function ProfileSessionsPage() {
  useSetBreadcrumb('Perfil / Sesiones');
  const { logoutAll } = useAuth();
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<Session | null>(null);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);

  const sessionsQuery = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authApi.listSessions });

  const revokeMutation = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Sesiones</h1>
          <p className="text-sm text-muted-foreground">Dispositivos donde tu cuenta tiene una sesión activa.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmingLogoutAll(true)}>
          <LogOut /> Cerrar todas
        </Button>
      </div>

      <QueryState query={sessionsQuery}>
        {(sessions) => (
          <div className="space-y-2">
            {sessions.length === 0 && <p className="text-sm text-muted-foreground">No hay sesiones activas.</p>}
            {sessions.map((session) => (
              <Card key={session.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3">
                    {session.userAgent?.toLowerCase().includes('mobile') ? (
                      <MonitorSmartphone className="size-5 text-muted-foreground" />
                    ) : (
                      <Laptop className="size-5 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {session.userAgent ?? 'Dispositivo desconocido'}
                        {session.isCurrent && <Badge variant="success">Esta sesión</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Última actividad{' '}
                        {formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true, locale: es })}
                        {session.ip ? ` · ${session.ip}` : ''}
                      </p>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Revocar sesión"
                      onClick={() => setRevoking(session)}
                    >
                      <ShieldX className="text-destructive" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revocar sesión"
        description="El dispositivo perderá acceso inmediatamente y deberá iniciar sesión nuevamente."
        confirmLabel="Revocar"
        variant="destructive"
        onConfirm={async () => {
          if (revoking) await revokeMutation.mutateAsync(revoking.id);
        }}
      />

      <ConfirmDialog
        open={confirmingLogoutAll}
        onOpenChange={setConfirmingLogoutAll}
        title="Cerrar todas las sesiones"
        description="Se cerrará tu sesión en todos los dispositivos, incluido este. Deberás iniciar sesión nuevamente."
        confirmLabel="Cerrar todas"
        variant="destructive"
        onConfirm={logoutAll}
      />
    </div>
  );
}
