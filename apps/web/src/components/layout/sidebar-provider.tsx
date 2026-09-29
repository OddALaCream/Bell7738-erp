import { useEffect, useState, type ReactNode } from 'react';
import { SidebarContext } from './sidebar-context';

const STORAGE_KEY = 'erp.sidebar.collapsed';

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Best-effort UI preference only; ignore storage failures (private mode, quota).
    }
  }, [collapsed]);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((v) => !v) }}>
      {children}
    </SidebarContext.Provider>
  );
}
