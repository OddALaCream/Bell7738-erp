import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MeetingDetail, MeetingNotes } from '@/types/domain';
import * as api from './api';

export const meetingKeys = {
  all: (projectId: string) => ['projects', projectId, 'meetings'] as const,
  list: (projectId: string, params: api.ListMeetingsParams) => ['projects', projectId, 'meetings', 'list', params] as const,
  detail: (projectId: string, meetingId: string) => ['projects', projectId, 'meetings', 'detail', meetingId] as const,
};

export function useMeetings(projectId: string, params: api.ListMeetingsParams) {
  return useQuery({
    queryKey: meetingKeys.list(projectId, params),
    queryFn: () => api.listMeetings(projectId, params),
    placeholderData: keepPreviousData,
  });
}

export function useMeeting(projectId: string, meetingId: string | undefined) {
  return useQuery({
    queryKey: meetingKeys.detail(projectId, meetingId ?? ''),
    queryFn: () => api.getMeeting(projectId, meetingId!),
    enabled: !!meetingId,
  });
}

function invalidateMeetings(queryClient: QueryClient, projectId: string) {
  queryClient.invalidateQueries({ queryKey: meetingKeys.all(projectId) });
  // Derived read models (calendar, My Schedule, dashboard, activity) consume the same meetings.
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'calendar'] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
  queryClient.invalidateQueries({ queryKey: ['schedule'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useCreateMeeting(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.CreateMeetingPayload) => api.createMeeting(projectId, payload),
    onSuccess: () => {
      invalidateMeetings(queryClient, projectId);
      toast.success('Reunión creada.');
    },
  });
}

export function useUpdateMeeting(projectId: string, meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.UpdateMeetingPayload) => api.updateMeeting(projectId, meetingId, payload),
    onSuccess: () => invalidateMeetings(queryClient, projectId),
  });
}

export function useSetMeetingParticipants(projectId: string, meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantIds: string[]) => api.setMeetingParticipants(projectId, meetingId, participantIds),
    onSuccess: () => invalidateMeetings(queryClient, projectId),
  });
}

/**
 * The notes endpoint returns the meeting without `viewerCapabilities`, so
 * merge the result into the cached detail instead of replacing it: the new
 * revision must be visible immediately for the next save's `expectedRevision`.
 */
export function useUpdateMeetingNotes(projectId: string, meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ notes, expectedRevision }: { notes: MeetingNotes; expectedRevision: number }) =>
      api.updateMeetingNotes(projectId, meetingId, notes, expectedRevision),
    onSuccess: (updated) => {
      queryClient.setQueryData<MeetingDetail>(meetingKeys.detail(projectId, meetingId), (previous) =>
        previous ? { ...previous, ...updated } : previous,
      );
      queryClient.invalidateQueries({ queryKey: [...meetingKeys.all(projectId), 'list'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'activity'] });
    },
  });
}

export function useDeleteMeeting(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => api.deleteMeeting(projectId, meetingId),
    onSuccess: () => {
      invalidateMeetings(queryClient, projectId);
      toast.success('Reunión eliminada.');
    },
  });
}
