import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { ProjectDetail, ProjectMember, ProjectRole, ProjectStatus, ProjectSummary } from '@/types/domain';

export interface ListProjectsParams {
  search?: string;
  status?: ProjectStatus;
  view?: 'active' | 'completed' | 'paused' | 'endingSoon' | 'overdue';
  startFrom?: string;
  startTo?: string;
  endFrom?: string;
  endTo?: string;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt' | 'startDate' | 'expectedEndDate' | 'name';
  order?: 'asc' | 'desc';
}

export async function listProjects(params: ListProjectsParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<ProjectSummary>>('/projects', { params });
  return data;
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  return api.get<ProjectDetail>(`/projects/${projectId}`);
}

export interface ProjectPayload {
  name: string;
  description?: string;
  clientName?: string;
  status?: ProjectStatus;
  startDate?: string;
  expectedEndDate?: string;
}

export async function createProject(payload: ProjectPayload): Promise<ProjectSummary> {
  return api.post<ProjectSummary>('/projects', payload);
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
  clientName?: string | null;
  status?: ProjectStatus;
  startDate?: string | null;
  expectedEndDate?: string | null;
}

export async function updateProject(projectId: string, payload: UpdateProjectPayload): Promise<ProjectSummary> {
  return api.patch<ProjectSummary>(`/projects/${projectId}`, payload);
}

export async function deleteProject(projectId: string): Promise<void> {
  await http.delete(`/projects/${projectId}`);
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return api.get<ProjectMember[]>(`/projects/${projectId}/members`);
}

export async function addProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<ProjectMember> {
  return api.post<ProjectMember>(`/projects/${projectId}/members`, { userId, role });
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMember> {
  return api.patch<ProjectMember>(`/projects/${projectId}/members/${userId}`, { role });
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await http.delete(`/projects/${projectId}/members/${userId}`);
}
