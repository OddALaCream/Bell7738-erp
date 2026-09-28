import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';

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
