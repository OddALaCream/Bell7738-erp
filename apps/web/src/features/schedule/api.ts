import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { CalendarItem, TaskAssignee, TaskStatus } from '@/types/domain';

/** Matches TIMELINE_TASK_SELECT in apps/api/src/schedule/schedule.service.ts (no `assignedAt`). */
export interface TimelineTask {
  id: string;
  projectId: string;
  title: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  assignees: Array<Pick<TaskAssignee, 'userId' | 'user'>>;
}

export interface TimelineParams {
  from?: string;
  to?: string;
  status?: TaskStatus;
  assigneeId?: string;
}

const MAX_PAGE_SIZE = 100;

/**
 * These read models are small per user/project and drive views that need the
 * whole set (a bar chart, a month grid), so pull every page instead of
 * paginating the UI. Pages after the first are requested in parallel.
 */
async function fetchAllPages<T>(fetchPage: (page: number) => Promise<ApiCollectionResponse<T>>): Promise<T[]> {
  const first = await fetchPage(1);
  if (first.meta.totalPages <= 1) return first.data;
  const rest = await Promise.all(
    Array.from({ length: first.meta.totalPages - 1 }, (_, index) => fetchPage(index + 2)),
  );
  return [...first.data, ...rest.flatMap((page) => page.data)];
}

export function getProjectTimeline(projectId: string, params: TimelineParams = {}) {
  return fetchAllPages(async (page) => {
    const { data } = await http.get<ApiCollectionResponse<TimelineTask>>(`/projects/${projectId}/timeline`, {
      params: { ...params, page, pageSize: MAX_PAGE_SIZE },
    });
    return data;
  });
}

/** `from`/`to` are inclusive `YYYY-MM-DD`; the API caps the span at 100 days. */
export function getProjectCalendar(projectId: string, from: string, to: string): Promise<CalendarItem[]> {
  return api.get<CalendarItem[]>(`/projects/${projectId}/calendar`, { params: { from, to } });
}

export interface MyScheduleParams {
  kind?: 'all' | 'task' | 'meeting';
  projectId?: string;
  from?: string;
  to?: string;
  status?: TaskStatus;
}

export function getMySchedule(params: MyScheduleParams = {}) {
  return fetchAllPages(async (page) => {
    const { data } = await http.get<ApiCollectionResponse<CalendarItem>>('/me/schedule', {
      params: { ...params, page, pageSize: MAX_PAGE_SIZE },
    });
    return data;
  });
}
