import { useQueries, useQuery } from '@tanstack/react-query';
import { addDays, todayDateOnly } from '@/lib/dates';
import { listActivityFeed } from '@/features/activity/api';
import { useProjects } from '@/features/projects/hooks';
import { getMySchedule } from '@/features/schedule/api';
import { useMySchedule } from '@/features/schedule/hooks';
import { useTeam } from '@/features/users/hooks';
import type { CalendarItem } from '@/types/domain';

/**
 * Each block is composed from an existing endpoint, as its own query, so a
 * failure only replaces that block (docs/UI-UX.md: "un fallo parcial muestra
 * error sólo en el bloque afectado"). There is deliberately no `GET /dashboard`:
 * five bounded reads on indexed, scope-filtered endpoints don't justify a
 * second read model to keep in sync.
 */
export interface BlockQuery<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  refetch: () => void;
}

const UPCOMING_MEETINGS_WINDOW_DAYS = 30;
const ACTIVITY_LIMIT = 8;
export const DASHBOARD_PROJECT_LIMIT = 5;

const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS'] as const;

/** My unfinished tasks, any date (overdue ones matter most). */
export function useDashboardTasks(): BlockQuery<CalendarItem[]> {
  return useQueries({
    queries: OPEN_STATUSES.map((status) => ({
      queryKey: ['schedule', 'me', { kind: 'task', status, scope: 'dashboard' }],
      queryFn: () => getMySchedule({ kind: 'task', status }),
    })),
    combine: (results) => ({
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
      error: results.find((result) => result.isError)?.error ?? null,
      data: results.every((result) => result.data) ? results.flatMap((result) => result.data ?? []) : undefined,
      refetch: () => results.forEach((result) => result.refetch()),
    }),
  });
}

/** My meetings from today onward (a bounded window); the block filters out ones already over. */
export function useDashboardMeetings() {
  const today = todayDateOnly();
  return useMySchedule({ kind: 'meeting', from: today, to: addDays(today, UPCOMING_MEETINGS_WINDOW_DAYS) });
}

export function useDashboardProjects() {
  return useProjects({ view: 'active', pageSize: DASHBOARD_PROJECT_LIMIT, sort: 'expectedEndDate', order: 'asc' });
}

/** The latest events across the projects the person can see: one request, scope applied by the API. */
export function useDashboardActivity() {
  return useQuery({
    queryKey: ['activity', 'feed', { pageSize: ACTIVITY_LIMIT, scope: 'dashboard' }],
    queryFn: async () => (await listActivityFeed({ pageSize: ACTIVITY_LIMIT })).data,
  });
}

const TEAM_PREVIEW = 8;

export function useDashboardTeam() {
  return useTeam({ pageSize: TEAM_PREVIEW });
}
