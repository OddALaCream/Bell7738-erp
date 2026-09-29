import {
  LayoutDashboard,
  CalendarClock,
  FolderKanban,
  Users,
  ShieldCheck,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Frequent, "your work" destinations shown in the compact mobile bar too. */
  primary?: boolean;
}

export const mainNavItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { to: '/schedule', label: 'Mi cronograma', icon: CalendarClock, primary: true },
  { to: '/projects', label: 'Proyectos', icon: FolderKanban, primary: true },
  { to: '/team', label: 'Equipo', icon: Users, primary: true },
];

/**
 * Shown only to the Owner — see docs/FRONTEND_BACKEND_GAPS.md: non-owner
 * effective permissions aren't exposed by /auth/me, so this is the one
 * capability the frontend can reliably check client-side.
 */
export const adminNavItems: NavItem[] = [
  { to: '/admin/users', label: 'Usuarios', icon: Users },
  { to: '/admin/roles', label: 'Roles', icon: ShieldCheck },
  { to: '/admin/audit', label: 'Auditoría', icon: ScrollText },
];
