import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { Spinner } from '@/components/ui/spinner';
import { canAny, type PermissionKey } from '@/lib/permissions';
import { EmptyState } from '@/components/common/empty-state';
import { ShieldOff } from 'lucide-react';

/**
 * docs/UI-UX.md "Recuperación de sesión": show a brief restoring state and
 * never render a previous user's data while the initial refresh is in flight.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Restaurando sesión" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

export function RequireGuest({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/**
 * Keeps a screen the person can't use from rendering (and failing with a 403).
 * Purely a courtesy: the API refuses the requests either way.
 */
export function RequirePermission({ anyOf, children }: { anyOf: PermissionKey[]; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!canAny(can, ...anyOf)) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <EmptyState
          icon={ShieldOff}
          title="No tienes acceso a esta sección"
          description="Pide a un administrador que te asigne el permiso necesario."
        />
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * The landing page is the dashboard (docs/RBAC.md: DASHBOARD_VIEW). Without the
 * permission the person lands on their own schedule instead, which needs none.
 */
export function RequireDashboard({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  return can('DASHBOARD_VIEW') ? <>{children}</> : <Navigate to="/schedule" replace />;
}
