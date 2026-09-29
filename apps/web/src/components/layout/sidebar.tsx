import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/auth-context';
import { visibleAdminItems, visibleMainItems, type NavItem } from './nav-config';
import { useSidebar } from './sidebar-context';

export function SidebarTrigger({ className, ...props }: ButtonProps) {
  const { collapsed, toggle } = useSidebar();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} className={className} aria-label="Alternar barra lateral" {...props}>
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <item.icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const { collapsed } = useSidebar();
  const { can } = useAuth();
  const adminItems = visibleAdminItems(can);

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-border px-4', collapsed && 'justify-center px-0')}>
        <span className="text-sm font-semibold tracking-tight">{collapsed ? 'ERP' : 'Startup ERP'}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {visibleMainItems(can).map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} />
        ))}
        {adminItems.length > 0 && (
          <>
            <div className={cn('mt-4 mb-1 px-3 text-xs font-semibold uppercase text-muted-foreground', collapsed && 'sr-only')}>
              Administración
            </div>
            {adminItems.map((item) => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
