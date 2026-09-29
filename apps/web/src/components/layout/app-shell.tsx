import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { SidebarProvider } from './sidebar-provider';
import { MobileNav } from './mobile-nav';
import { Header } from './header';
import { useBreadcrumb } from './breadcrumb-context';
import { BreadcrumbProvider } from './breadcrumb-provider';
import { ConnectionBanner } from '@/features/pwa/connection-banner';

function Shell() {
  const breadcrumb = useBreadcrumb();
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header breadcrumb={breadcrumb} />
        <ConnectionBanner />
        <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

export function AppShell() {
  return (
    <SidebarProvider>
      <BreadcrumbProvider>
        <Shell />
      </BreadcrumbProvider>
    </SidebarProvider>
  );
}
