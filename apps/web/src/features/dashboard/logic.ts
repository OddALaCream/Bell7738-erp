import { toDateOnly } from '@/lib/dates';
import type { CalendarItem } from '@/types/domain';

type TaskItem = Extract<CalendarItem, { kind: 'task' }>;
type MeetingItem = Extract<CalendarItem, { kind: 'meeting' }>;

/**
 * docs/UI-UX.md: "Mis tareas, priorizando vencidas y próximas por fecha".
 * Overdue first (the oldest deadline first), then the rest by due date; ties
 * keep the API's order so the list doesn't reshuffle between refreshes.
 */
export function prioritizeTasks(tasks: TaskItem[], today: string, limit: number): TaskItem[] {
  const open = tasks.filter((task) => task.status !== 'DONE');
  const rank = (task: TaskItem) => (toDateOnly(task.end) < today ? 0 : 1);
  return [...open]
    .sort((a, b) => rank(a) - rank(b) || toDateOnly(a.end).localeCompare(toDateOnly(b.end)))
    .slice(0, limit);
}

/** The soonest meetings that haven't ended yet (one that is happening now counts). */
export function nextMeetings(items: CalendarItem[], nowMs: number, limit: number): MeetingItem[] {
  return items
    .filter((item): item is MeetingItem => item.kind === 'meeting' && Date.parse(item.end) > nowMs)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, limit);
}
