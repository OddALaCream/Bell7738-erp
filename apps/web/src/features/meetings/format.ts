import { formatDateOnly, formatTime, instantToLocalDay, localTimeZoneLabel } from '@/lib/dates';
import type { Meeting } from '@/types/domain';

/** One line: "lun, 28 sept · 14:00 – 15:00 (GMT-5)"; the end date is added if the meeting spans days. */
export function formatMeetingWhen(meeting: Pick<Meeting, 'startsAt' | 'endsAt'>): string {
  const startDay = instantToLocalDay(meeting.startsAt);
  const endDay = instantToLocalDay(meeting.endsAt);
  const day = formatDateOnly(startDay, { weekday: 'short', day: 'numeric', month: 'short' });
  const end =
    startDay === endDay
      ? formatTime(meeting.endsAt)
      : `${formatDateOnly(endDay, { day: 'numeric', month: 'short' })} ${formatTime(meeting.endsAt)}`;
  return `${day} · ${formatTime(meeting.startsAt)} – ${end} (${localTimeZoneLabel()})`;
}

export type MeetingPhase = 'upcoming' | 'live' | 'past';

/** Where a meeting is relative to now (evaluated at call time). */
export function meetingPhase(meeting: Pick<Meeting, 'startsAt' | 'endsAt'>): MeetingPhase {
  const now = Date.now();
  if (Date.parse(meeting.endsAt) <= now) return 'past';
  if (Date.parse(meeting.startsAt) <= now) return 'live';
  return 'upcoming';
}

export const MEETING_PHASE_LABEL: Record<MeetingPhase, string> = {
  upcoming: 'Próxima',
  live: 'En curso',
  past: 'Finalizada',
};
