import { api } from '@/lib/api-client';
import { changePassword as authChangePassword } from '@/features/auth/api';
import type { ProjectSummary, Task, UserStatus } from '@/types/domain';

/**
 * `apps/api/src/users/users.service.ts`'s EMPTY_PROFILE_EXTRAS currently
 * hardcodes roles/projects/tasks to empty arrays for every profile — see
 * docs/FRONTEND_BACKEND_GAPS.md. Typed here as the documented shape so the
 * UI renders correctly once the backend fills it in.
 */
export interface OwnProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
  isOwner: boolean;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  roles: string[];
  activeProjects: ProjectSummary[];
  pastProjects: ProjectSummary[];
  activeTasks: Task[];
  completedTasks: Task[];
}

export interface PublicProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
  roles: string[];
  activeProjects: ProjectSummary[];
  pastProjects: ProjectSummary[];
  activeTasks: Task[];
  completedTasks: Task[];
}

export async function getOwnProfile(): Promise<OwnProfile> {
  return api.get<OwnProfile>('/me/profile');
}

export interface UpdateOwnProfilePayload {
  firstName?: string;
  lastName?: string;
}

export async function updateOwnProfile(payload: UpdateOwnProfilePayload): Promise<OwnProfile> {
  return api.patch<OwnProfile>('/me/profile', payload);
}

export async function getUserProfile(userId: string): Promise<PublicProfile> {
  return api.get<PublicProfile>(`/users/${userId}/profile`);
}

export const changePassword = authChangePassword;
