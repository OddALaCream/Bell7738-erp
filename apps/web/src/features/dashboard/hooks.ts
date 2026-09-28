import { useQueries } from '@tanstack/react-query';
import { addDays, todayDateOnly } from '@/lib/dates';
import { listProjectActivity } from '@/features/activity/api';
import { useProjects } from '@/features/projects/hooks';
import { getMySchedule } from '@/features/schedule/api';
import { useMySchedule } from '@/features/schedule/hooks';
import { useTeam } from '@/features/users/hooks';
import type { ActivityEvent, CalendarItem } from '@/types/domain';
import { mergeRecentActivity } from './logic';

/**
 * The API has no `GET /dashboard` (docs/FRONTEND_BACKEND_GAPS.md), so each
 * block is composed from existing endpoints. Every block is its own query so
 * a failure only replaces that block (docs/UI-UX.md: "un fallo parcial muestra
 * error sólo en el bloque afectado").
 */
export interface BlockQuery<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  refetch: () => void;
}

const UPCOMING_MEETINGS_WINDOW_DAYS = 30;
const ACTIVITY_PROJECTS = 4;
const ACTIVITY_PER_PROJECT = 5;
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

/**
 * There is no cross-project activity feed, so read the latest few events of
 * a handful of active projects and merge them. Projects that fail (e.g. lost
 * access meanwhile) are skipped; the block errors only if none could be read.
 */
export function useDashboardActivity(projectIds: string[]): BlockQuery<ActivityEvent[]> {
  const ids = projectIds.slice(0, ACTIVITY_PROJECTS);
  return useQueries({
    queries: ids.map((projectId) => ({
      queryKey: ['projects', projectId, 'activity', { pageSize: ACTIVITY_PER_PROJECT, scope: 'dashboard' }],
      queryFn: async () => (await listProjectActivity(projectId, { pageSize: ACTIVITY_PER_PROJECT })).data,
    })),
    combine: (results) => {
      const settled = results.every((result) => !result.isPending);
      const succeeded = results.filter((result) => result.data);
      return {
        isPending: !settled,
        isError: settled && results.length > 0 && succeeded.length === 0,
        error: results.find((result) => result.isError)?.error ?? null,
        data: settled ? mergeRecentActivity(succeeded.map((result) => result.data ?? []), 8) : undefined,
        refetch: () => results.forEach((result) => result.refetch()),
      };
    },
  });
}

const TEAM_PREVIEW = 8;

export function useDashboardTeam() {
  return useTeam({ pageSize: TEAM_PREVIEW });
}
