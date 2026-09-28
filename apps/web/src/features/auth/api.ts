import { http, setAccessToken } from '@/lib/api-client';
import type { UserSummary, Session } from '@/types/domain';

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: UserSummary;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await http.post<LoginResponse>('/auth/login', { email, password });
  setAccessToken(data.accessToken);
  return data;
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
  const { data } = await http.get<UserSummary>('/auth/me');
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { data } = await http.post<{ accessToken: string }>('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  setAccessToken(data.accessToken);
}

export async function listSessions(): Promise<Session[]> {
  const { data } = await http.get<Session[]>('/auth/sessions');
  return data;
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
