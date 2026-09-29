import { canAny, type Can, type PermissionKey } from '@/lib/permissions';
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
  /** Shown when the person holds at least one of these (UX only; the API decides). */
  anyOf?: PermissionKey[];
}

export const mainNavItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { to: '/schedule', label: 'Mi cronograma', icon: CalendarClock, primary: true },
  { to: '/projects', label: 'Proyectos', icon: FolderKanban, primary: true },
  { to: '/team', label: 'Equipo', icon: Users, primary: true },
];

/**
 * Each entry appears for whoever the backend reports the matching permission
 * for (`GET /auth/me`) — an administrator with custom roles included, not only
 * the Owner, whose catalog holds every key.
 */
export const adminNavItems: NavItem[] = [
  { to: '/admin/users', label: 'Usuarios', icon: Users, anyOf: ['USERS_VIEW'] },
  { to: '/admin/roles', label: 'Roles', icon: ShieldCheck, anyOf: ['ROLES_VIEW', 'ROLES_MANAGE'] },
  { to: '/admin/audit', label: 'Auditoría', icon: ScrollText, anyOf: ['AUDIT_VIEW'] },
];

export function visibleAdminItems(can: Can): NavItem[] {
  return adminNavItems.filter((item) => !item.anyOf || canAny(can, ...item.anyOf));
}
