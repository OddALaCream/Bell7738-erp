import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { Invitation, InvitationStatus, InvitationWithManualLink } from '@/types/domain';

export interface ListInvitationsParams {
  status?: InvitationStatus;
  page?: number;
  pageSize?: number;
}

export async function listInvitations(params: ListInvitationsParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<Invitation>>('/invitations', { params });
  return data;
}

export interface CreateInvitationPayload {
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
}

export async function createInvitation(payload: CreateInvitationPayload): Promise<InvitationWithManualLink> {
  return api.post<InvitationWithManualLink>('/invitations', payload);
}

export async function resendInvitation(invitationId: string): Promise<InvitationWithManualLink> {
  return api.post<InvitationWithManualLink>(`/invitations/${invitationId}/resend`);
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await http.post(`/invitations/${invitationId}/revoke`);
}
