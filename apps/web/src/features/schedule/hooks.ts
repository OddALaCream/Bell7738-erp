import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as api from './api';

export interface DateRange {
  from: string;
  to: string;
}

export function useProjectTimeline(projectId: string, params: api.TimelineParams = {}) {
  return useQuery({
    queryKey: ['projects', projectId, 'timeline', params],
    queryFn: () => api.getProjectTimeline(projectId, params),
  });
}

/**
 * `range` is null until the calendar reports its first visible range. The
 * previous range's items stay on screen while the next one loads so moving
 * between months never blanks the grid.
 */
export function useProjectCalendar(projectId: string, range: DateRange | null) {
  return useQuery({
    queryKey: ['projects', projectId, 'calendar', range?.from, range?.to],
    queryFn: () => api.getProjectCalendar(projectId, range!.from, range!.to),
    enabled: range !== null,
    placeholderData: keepPreviousData,
  });
}

export function useMySchedule(params: api.MyScheduleParams, enabled = true) {
  return useQuery({
    queryKey: ['schedule', 'me', params],
    queryFn: () => api.getMySchedule(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}
