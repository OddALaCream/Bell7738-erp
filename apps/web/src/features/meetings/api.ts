import { api, http } from '@/lib/api-client';
import type { ApiCollectionResponse } from '@/lib/api-types';
import type { Meeting, MeetingDetail, MeetingNotes } from '@/types/domain';

export interface ListMeetingsParams {
  view?: 'upcoming' | 'past';
  participantId?: string;
  /** ISO 8601 instants. */
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'startsAt' | 'createdAt' | 'title';
  order?: 'asc' | 'desc';
}

export async function listMeetings(projectId: string, params: ListMeetingsParams = {}) {
  const { data } = await http.get<ApiCollectionResponse<Meeting>>(`/projects/${projectId}/meetings`, { params });
  return data;
}

export function getMeeting(projectId: string, meetingId: string): Promise<MeetingDetail> {
  return api.get<MeetingDetail>(`/projects/${projectId}/meetings/${meetingId}`);
}

export interface CreateMeetingPayload {
  title: string;
  description?: string;
  /** ISO 8601 instants (UTC). */
  startsAt: string;
  endsAt: string;
  /** Additional invitees; the API always adds the organizer. */
  participantIds: string[];
}

export function createMeeting(projectId: string, payload: CreateMeetingPayload): Promise<Meeting> {
  return api.post<Meeting>(`/projects/${projectId}/meetings`, payload);
}

export interface UpdateMeetingPayload {
  title?: string;
  /** `null` clears the agenda. */
  description?: string | null;
  startsAt?: string;
  endsAt?: string;
}

export function updateMeeting(projectId: string, meetingId: string, payload: UpdateMeetingPayload): Promise<Meeting> {
  return api.patch<Meeting>(`/projects/${projectId}/meetings/${meetingId}`, payload);
}

/** Replaces the whole participant set; the organizer is kept by the API even if omitted. */
export function setMeetingParticipants(projectId: string, meetingId: string, participantIds: string[]): Promise<Meeting> {
  return api.put<Meeting>(`/projects/${projectId}/meetings/${meetingId}/participants`, { participantIds });
}

export function updateMeetingNotes(
  projectId: string,
  meetingId: string,
  notes: MeetingNotes,
  expectedRevision: number,
): Promise<Meeting> {
  return api.patch<Meeting>(`/projects/${projectId}/meetings/${meetingId}/notes`, { notes, expectedRevision });
}

export async function deleteMeeting(projectId: string, meetingId: string): Promise<void> {
  await http.delete(`/projects/${projectId}/meetings/${meetingId}`);
}
