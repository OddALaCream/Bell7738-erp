/**
 * docs/DATABASE.md: "action String controlado por backend." Single source
 * of truth for every value ever written to AuditLog.action.
 */
export const AUDIT_ACTIONS = [
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'AUTH_REFRESH_REJECTED',
  'AUTH_LOGOUT',
  'AUTH_LOGOUT_ALL',
  'AUTH_SESSION_REVOKED',
  'AUTH_PASSWORD_CHANGED',
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
