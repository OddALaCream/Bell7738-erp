import type { ProjectRole, ProjectStatus } from '@/types/domain';

/** One source for how project statuses and local roles read in the UI (the API speaks in enum keys). */
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNED: 'Planificado',
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  MANAGER: 'Manager',
  MEMBER: 'Miembro',
  VIEWER: 'Viewer',
};
