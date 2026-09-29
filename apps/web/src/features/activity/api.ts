import { http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { ActivityEvent, ActivityEventType } from '@/types/domain';

export interface ListActivityParams {
  type?: ActivityEventType;
  actorId?: string;
  /** ISO 8601 instants. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Newest first across every project the person can see (the dashboard feed). */
export async function listActivityFeed(params: ListActivityParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<ActivityEvent>>('/activity', { params });
  return data;
}

/** Newest first; visible to anyone who can see the project. */
export async function listProjectActivity(projectId: string, params: ListActivityParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<ActivityEvent>>(`/projects/${projectId}/activity`, { params });
  return data;
}
