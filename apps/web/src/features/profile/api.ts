import { api } from '@/lib/api-client';
import { changePassword as authChangePassword } from '@/features/auth/api';
import type { ProjectRole, ProjectStatus, RoleSummary, TaskStatus, UserStatus } from '@/types/domain';

/** What `/me/profile` and `/users/:id/profile` report about a person's work, as far as the observer may see it. */
export interface ProfileProject {
  id: string;
  name: string;
  status: ProjectStatus;
  /** The person's local role in the project. */
  role: ProjectRole;
  startDate: string | null;
  expectedEndDate: string | null;
}

export interface ProfileTask {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  completedAt: string | null;
}

export interface ProfileExtras {
  roles: RoleSummary[];
  activeProjects: ProfileProject[];
  pastProjects: ProfileProject[];
  activeTasks: ProfileTask[];
  completedTasks: ProfileTask[];
}

export interface OwnProfile extends ProfileExtras {
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
}

export interface PublicProfile extends ProfileExtras {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
}

export async function getOwnProfile(): Promise<OwnProfile> {
  return api.get<OwnProfile>('/me/profile');
}

export interface UpdateOwnProfilePayload {
  firstName?: string;
  lastName?: string;
}

/** The write answers with the person's own data only; the lists are re-read with the profile query. */
export async function updateOwnProfile(payload: UpdateOwnProfilePayload): Promise<Omit<OwnProfile, keyof ProfileExtras>> {
  return api.patch<Omit<OwnProfile, keyof ProfileExtras>>('/me/profile', payload);
}

export async function getUserProfile(userId: string): Promise<PublicProfile> {
  return api.get<PublicProfile>(`/users/${userId}/profile`);
}

export const changePassword = authChangePassword;
