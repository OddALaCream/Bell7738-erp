import type { AuditAction } from './api';

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  USER_INVITED: 'Usuario invitado',
  USER_INVITATION_RESENT: 'Invitación reenviada',
  USER_INVITATION_REVOKED: 'Invitación revocada',
  USER_INVITATION_ACCEPTED: 'Invitación aceptada',
  USER_UPDATED: 'Usuario editado',
  USER_SUSPENDED: 'Usuario suspendido',
  USER_DISABLED: 'Usuario deshabilitado',
  USER_REACTIVATED: 'Usuario reactivado',
  ROLE_CREATED: 'Rol creado',
  ROLE_UPDATED: 'Rol editado',
  ROLE_DELETED: 'Rol eliminado',
  USER_ROLES_ASSIGNED: 'Roles asignados',
};
