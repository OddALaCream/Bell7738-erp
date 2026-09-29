import type { Permission } from '@/types/domain';

const DOMAIN_LABELS: Record<string, string> = {
  DASHBOARD: 'General',
  PROJECTS: 'Proyectos',
  PROJECT: 'Proyectos',
  TASKS: 'Tareas',
  MEETINGS: 'Reuniones',
  DOCUMENTS: 'Documentos',
  USERS: 'Usuarios',
  ROLES: 'Roles',
  AUDIT: 'Auditoría',
};

function domainOf(key: string): string {
  const prefix = key.split('_')[0] ?? key;
  return DOMAIN_LABELS[prefix] ?? prefix;
}

export function groupPermissionsByDomain(permissions: Permission[]): Array<[string, Permission[]]> {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const domain = domainOf(permission.key);
    const list = groups.get(domain) ?? [];
    list.push(permission);
    groups.set(domain, list);
  }
  return Array.from(groups.entries());
}
