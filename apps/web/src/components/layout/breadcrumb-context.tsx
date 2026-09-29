import { createContext, useContext, useEffect, type ReactNode } from 'react';

export interface BreadcrumbContextValue {
  node: ReactNode;
  setNode: (node: ReactNode) => void;
}

export const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function useBreadcrumb(): ReactNode {
  const ctx = useContext(BreadcrumbContext);
  return ctx?.node ?? null;
}

/** Pages call this to publish their breadcrumb into the shell header. */
export function useSetBreadcrumb(node: ReactNode): void {
  const ctx = useContext(BreadcrumbContext);
  useEffect(() => {
    ctx?.setNode(node);
    return () => ctx?.setNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
}
