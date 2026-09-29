import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, registerSessionExpiredHandler, setAccessToken } from '@/lib/api-client';
import { makeCan } from '@/lib/permissions';
import type { CurrentUser } from '@/types/domain';
import { AuthContext, type AuthContextValue } from './auth-context';
import * as authApi from './api';

const PERMISSION_SYNC_MS = 60_000;

/**
 * Bootstraps a session on load by attempting a single coordinated refresh
 * (docs/UI-UX.md "Recuperación de sesión"): never render a previous user's
 * data while that's in flight, and go straight to anonymous if it fails.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('restoring');
  const queryClient = useQueryClient();
  const bootstrapped = useRef(false);

  const handleSessionExpired = useCallback(() => {
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    registerSessionExpiredHandler(handleSessionExpired);
  }, [handleSessionExpired]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const response = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(response.accessToken);
        const me = await authApi.fetchMe();
        setUser(me);
        setStatus('authenticated');
      } catch {
        setAccessToken(null);
        setUser(null);
        setStatus('anonymous');
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const logoutAll = useCallback(async () => {
    await authApi.logoutAll();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  // Roles can change while the app stays open; re-read the effective permissions
  // when the person comes back to the tab (at most once a minute). A failure is
  // ignored here: the API client already handles an expired session.
  const lastSync = useRef(0);
  useEffect(() => {
    if (status !== 'authenticated') return;
    lastSync.current = Date.now();
    function onVisible() {
      if (document.visibilityState !== 'visible' || Date.now() - lastSync.current < PERMISSION_SYNC_MS) return;
      lastSync.current = Date.now();
      void refreshUser().catch(() => undefined);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, refreshUser]);

  const can = useMemo(() => makeCan(user?.permissions), [user]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, logoutAll, refreshUser, can }}>
      {children}
    </AuthContext.Provider>
  );
}
