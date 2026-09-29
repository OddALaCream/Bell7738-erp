import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api-types';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, ForbiddenState, NotFoundState } from './error-state';

/**
 * Standard wrapper for a TanStack Query result: loading skeleton, forbidden
 * (403), not-found (404), generic error with retry, or the loaded content.
 * Keeps every screen honoring docs/UI-UX.md's "Estados comunes" without
 * re-deriving the same switch each time.
 */
export function QueryState<T>({
  query,
  skeleton,
  emptyWhen,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => void };
  skeleton?: ReactNode;
  emptyWhen?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }
  if (query.isError) {
    return <QueryErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const data = query.data as T;
  if (emptyWhen && empty && emptyWhen(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}

/**
 * docs/UI-UX.md "Error": 403/404 show a safe state (retrying can't help);
 * anything else offers a retry. Exported for screens that must keep their
 * content mounted (e.g. a calendar) and so can't wrap it in `QueryState`.
 */
export function QueryErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <ForbiddenState />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundState />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-2/3" />
    </div>
  );
}
