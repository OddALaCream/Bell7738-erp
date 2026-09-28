import { http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { Notification } from '@/types/domain';

export interface ListNotificationsParams {
  page?: number;
  pageSize?: number;
  read?: boolean;
  type?: string;
}

export async function listNotifications(params: ListNotificationsParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<Notification>>('/notifications', { params });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await http.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await http.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await http.post('/notifications/read-all');
}

/** Resolves a notification's link target, or null when the resource is gone (docs/UI-UX.md). */
export function notificationHref(notification: Notification): string | null {
  const resource = notification.resource;
  if (!resource) return null;
  switch (resource.kind) {
    case 'project':
      return resource.projectId ? `/projects/${resource.projectId}/overview` : null;
    case 'task':
      return resource.projectId ? `/projects/${resource.projectId}/tasks?taskId=${resource.id}` : null;
    case 'meeting':
      return resource.projectId ? `/projects/${resource.projectId}/meetings?meetingId=${resource.id}` : null;
    case 'document':
      return resource.projectId ? `/projects/${resource.projectId}/documents` : null;
    default:
      return null;
  }
}
