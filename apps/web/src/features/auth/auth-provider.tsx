import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { http, registerSessionExpiredHandler, setAccessToken } from '@/lib/api-client';
import type { UserSummary } from '@/types/domain';
import { AuthContext, type AuthContextValue } from './auth-context';
import * as authApi from './api';

/**
 * Bootstraps a session on load by attempting a single coordinated refresh
 * (docs/UI-UX.md "Recuperación de sesión"): never render a previous user's
 * data while that's in flight, and go straight to anonymous if it fails.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
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
        const response = await http.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(response.data.accessToken);
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

  return (
    <AuthContext.Provider value={{ user, status, login, logout, logoutAll, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
