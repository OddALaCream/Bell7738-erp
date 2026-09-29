import { useState, type ReactNode } from 'react';
import { BreadcrumbContext } from './breadcrumb-context';

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  return <BreadcrumbContext.Provider value={{ node, setNode }}>{children}</BreadcrumbContext.Provider>;
}
