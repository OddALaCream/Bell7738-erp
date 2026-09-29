import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';

/** Mirrors apps/api/src/audit/audit-actions.ts; `audit-actions.contract.test.ts` fails if they drift apart. */
export const AUDIT_ACTIONS = [
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'AUTH_REFRESH_REJECTED',
  'AUTH_LOGOUT',
  'AUTH_LOGOUT_ALL',
  'AUTH_SESSION_REVOKED',
  'AUTH_PASSWORD_CHANGED',
  'PROJECT_CREATED',
  'PROJECT_DELETED',
  'PROJECT_MEMBER_ADDED',
  'PROJECT_MEMBER_ROLE_CHANGED',
  'PROJECT_MEMBER_REMOVED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED',
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

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListAuditParams {
  actorId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listAudit(params: ListAuditParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<AuditLogEntry>>('/audit', { params });
  return data;
}

export async function getAuditEntry(id: string): Promise<AuditLogEntry> {
  return api.get<AuditLogEntry>(`/audit/${id}`);
}
