import { createContext, useContext } from 'react';
import type { CurrentUser } from '@/types/domain';
import type { Can } from '@/lib/permissions';

export interface AuthContextValue {
  user: CurrentUser | null;
  status: 'restoring' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** True when the backend reported every given permission for this person (UX only; the API re-checks). */
  can: Can;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
