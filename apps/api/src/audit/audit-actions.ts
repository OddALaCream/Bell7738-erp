/**
 * docs/DATABASE.md: "action String controlado por backend." Single source
 * of truth for every value ever written to AuditLog.action.
 */
export const AUDIT_ACTIONS = [
  'USER_INVITED',
  'USER_INVITATION_RESENT',
  'USER_INVITATION_REVOKED',
  'USER_INVITATION_ACCEPTED',
  'USER_UPDATED',
  'USER_SUSPENDED',
  'USER_DISABLED',
  'USER_REACTIVATED',
  'ROLE_CREATED',
  'ROLE_UPDATED',
  'ROLE_DELETED',
  'USER_ROLES_ASSIGNED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
