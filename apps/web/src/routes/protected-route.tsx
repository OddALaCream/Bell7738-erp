import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { Spinner } from '@/components/ui/spinner';

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
