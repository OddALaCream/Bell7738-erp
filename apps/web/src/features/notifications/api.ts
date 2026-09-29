import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { Notification, NotificationType } from '@/types/domain';

export interface ListNotificationsParams {
  page?: number;
  pageSize?: number;
  read?: boolean;
  type?: NotificationType;
}

/** docs/API.md: paginated, so already { data, meta } — not double-wrapped. */
export async function listNotifications(params: ListNotificationsParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<Notification>>('/notifications', { params });
  return data;
}

export async function fetchUnreadCount(): Promise<number> {
  const result = await api.get<{ count: number }>('/notifications/unread-count');
  return result.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await http.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await http.post('/notifications/read-all');
}

const TYPE_LABELS: Record<NotificationType, string> = {
  TASK_ASSIGNED: 'Se te asignó una tarea',
  MEETING_ADDED: 'Fuiste agregado a una reunión',
  MEETING_UPDATED: 'Una reunión en la que participas cambió',
  MEETING_REMINDER_24H: 'Recordatorio: reunión en 24 horas',
  MEETING_REMINDER_1H: 'Recordatorio: reunión en 1 hora',
};

/**
 * The API doesn't return joined names for the notification's related
 * task/meeting/actor (see docs/FRONTEND_BACKEND_GAPS.md), so this is
 * necessarily generic per-type copy rather than a specific message.
 */
export function notificationTitle(notification: Notification): string {
  return TYPE_LABELS[notification.type] ?? 'Notificación';
}

/** Resolves a notification's link target, or null when it can't be resolved. */
export function notificationHref(notification: Notification): string | null {
  if (notification.taskId && notification.projectId) {
    return `/projects/${notification.projectId}/tasks?taskId=${notification.taskId}`;
  }
  if (notification.meetingId && notification.projectId) {
    return `/projects/${notification.projectId}/meetings?meetingId=${notification.meetingId}`;
  }
  if (notification.projectId) {
    return `/projects/${notification.projectId}/overview`;
  }
  return null;
}
