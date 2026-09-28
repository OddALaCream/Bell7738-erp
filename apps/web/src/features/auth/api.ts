import { api, http, setAccessToken } from '@/lib/api-client';
import type { UserSummary, Session } from '@/types/domain';

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: UserSummary;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await api.post<LoginResponse>('/auth/login', { email, password });
  setAccessToken(result.accessToken);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await http.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
}

export async function logoutAll(): Promise<void> {
  try {
    await http.post('/auth/logout-all');
  } finally {
    setAccessToken(null);
  }
}

export async function fetchMe(): Promise<UserSummary> {
  return api.get<UserSummary>('/auth/me');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const result = await api.post<{ accessToken: string }>('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  setAccessToken(result.accessToken);
}

export async function listSessions(): Promise<Session[]> {
  return api.get<Session[]>('/auth/sessions');
}

export async function revokeSession(sessionId: string): Promise<void> {
  await http.delete(`/auth/sessions/${sessionId}`);
}

export interface AcceptInvitationPayload {
  token: string;
  password: string;
}

export async function acceptInvitation(payload: AcceptInvitationPayload): Promise<void> {
  await http.post('/invitations/accept', payload);
}
