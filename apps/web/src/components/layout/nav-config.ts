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
  /** A shorter label for the five-slot mobile bar, where a long one wraps and misaligns the icons. */
  mobileLabel?: string;
  /** Shown when the person holds at least one of these (UX only; the API decides). */
  anyOf?: PermissionKey[];
}

export const mainNavItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, primary: true, anyOf: ['DASHBOARD_VIEW'] },
  { to: '/schedule', label: 'Mi cronograma', mobileLabel: 'Cronograma', icon: CalendarClock, primary: true },
  { to: '/projects', label: 'Proyectos', icon: FolderKanban, primary: true },
  { to: '/team', label: 'Equipo', icon: Users, primary: true },
];

/**
 * Each entry appears for whoever the backend reports the matching permission
 * for (`GET /auth/me`) — an administrator with custom roles included, not only
 * the Owner, whose catalog holds every key.
 */
export const adminNavItems: NavItem[] = [
  { to: '/admin/users', label: 'Usuarios', icon: Users, anyOf: ['USERS_VIEW', 'USERS_CREATE'] },
  { to: '/admin/roles', label: 'Roles', icon: ShieldCheck, anyOf: ['ROLES_VIEW', 'ROLES_MANAGE'] },
  { to: '/admin/audit', label: 'Auditoría', icon: ScrollText, anyOf: ['AUDIT_VIEW'] },
];

function visible(items: NavItem[], can: Can): NavItem[] {
  return items.filter((item) => !item.anyOf || canAny(can, ...item.anyOf));
}

export function visibleMainItems(can: Can): NavItem[] {
  return visible(mainNavItems, can);
}

export function visibleAdminItems(can: Can): NavItem[] {
  return visible(adminNavItems, can);
}
