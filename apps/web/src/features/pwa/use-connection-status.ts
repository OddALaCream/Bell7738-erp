import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isNetworkFailure } from './connection';

function subscribeToOnlineEvents(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * docs/UI-UX.md "Banner de conexión cuando no sea posible consultar la API":
 * `online` is the browser's own signal; `apiUnreachable` covers the case the
 * browser thinks it's online but requests get no answer. It flips on a
 * failed query with no HTTP response and clears on the next success.
 */
export function useConnectionStatus() {
  const online = useSyncExternalStore(
    subscribeToOnlineEvents,
    () => navigator.onLine,
    () => true,
  );
  const queryClient = useQueryClient();
  const [apiUnreachable, setApiUnreachable] = useState(false);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.action.type === 'success') setApiUnreachable(false);
      else if (event.action.type === 'error' && isNetworkFailure(event.action.error)) setApiUnreachable(true);
    });
  }, [queryClient]);

  const retry = useCallback(() => {
    void queryClient.invalidateQueries({ refetchType: 'active' });
  }, [queryClient]);

  return { online, apiUnreachable, retry };
}
