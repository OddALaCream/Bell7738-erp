import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { Task, TaskStatus } from '@/types/domain';

export interface ListTasksParams {
  status?: TaskStatus;
  assigneeId?: string;
  from?: string;
  to?: string;
  includeCompleted?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'createdAt' | 'dueDate' | 'startDate' | 'title';
  order?: 'asc' | 'desc';
}

export async function listTasks(projectId: string, params: ListTasksParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<Task>>(`/projects/${projectId}/tasks`, { params });
  return data;
}

export async function getTask(projectId: string, taskId: string): Promise<Task> {
  return api.get<Task>(`/projects/${projectId}/tasks/${taskId}`);
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  startDate: string;
  dueDate: string;
  assigneeIds: string[];
}

export async function createTask(projectId: string, payload: CreateTaskPayload): Promise<Task> {
  return api.post<Task>(`/projects/${projectId}/tasks`, payload);
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  startDate?: string;
  dueDate?: string;
  status?: 'PENDING' | 'IN_PROGRESS';
}

export async function updateTask(projectId: string, taskId: string, payload: UpdateTaskPayload): Promise<Task> {
  return api.patch<Task>(`/projects/${projectId}/tasks/${taskId}`, payload);
}

export async function completeTask(projectId: string, taskId: string): Promise<Task> {
  return api.post<Task>(`/projects/${projectId}/tasks/${taskId}/complete`);
}

export async function reopenTask(projectId: string, taskId: string): Promise<Task> {
  return api.post<Task>(`/projects/${projectId}/tasks/${taskId}/reopen`);
}

export async function setTaskAssignees(projectId: string, taskId: string, assigneeIds: string[]): Promise<Task> {
  return api.put<Task>(`/projects/${projectId}/tasks/${taskId}/assignees`, { assigneeIds });
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await http.delete(`/projects/${projectId}/tasks/${taskId}`);
}
