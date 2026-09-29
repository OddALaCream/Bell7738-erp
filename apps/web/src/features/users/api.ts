import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { AdminUser, TeamUser, UserStatus } from '@/types/domain';

export interface ListUsersParams {
  search?: string;
  status?: UserStatus;
  roleId?: string;
  page?: number;
  pageSize?: number;
  sort?: 'name' | 'email' | 'createdAt';
  order?: 'asc' | 'desc';
}

export async function listUsers(params: ListUsersParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<AdminUser>>('/users', { params });
  return data;
}

export async function getUser(userId: string): Promise<AdminUser> {
  return api.get<AdminUser>(`/users/${userId}`);
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export async function updateUser(userId: string, payload: UpdateUserPayload): Promise<AdminUser> {
  return api.patch<AdminUser>(`/users/${userId}`, payload);
}

export async function suspendUser(userId: string): Promise<AdminUser> {
  return api.post<AdminUser>(`/users/${userId}/suspend`);
}

export async function reactivateUser(userId: string): Promise<AdminUser> {
  return api.post<AdminUser>(`/users/${userId}/reactivate`);
}

export async function disableUser(userId: string): Promise<AdminUser> {
  return api.post<AdminUser>(`/users/${userId}/disable`);
}

export async function assignUserRoles(userId: string, roleIds: string[]): Promise<AdminUser> {
  return api.put<AdminUser>(`/users/${userId}/roles`, { roleIds });
}

export interface ListTeamParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listTeam(params: ListTeamParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<TeamUser>>('/team', { params });
  return data;
}
