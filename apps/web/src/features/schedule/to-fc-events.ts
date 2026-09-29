import type { EventInput } from '@fullcalendar/core';
import { addDays } from '@/lib/dates';
import type { CalendarItem, TaskStatus } from '@/types/domain';

/** What each FullCalendar event carries so a click can be routed to the shared detail. */
export interface CalendarEventProps {
  kind: 'task' | 'meeting';
  id: string;
  projectId: string;
  status?: TaskStatus;
}

export function toFullCalendarEvent(item: CalendarItem): EventInput {
  if (item.kind === 'task') {
    const props: CalendarEventProps = { kind: 'task', id: item.id, projectId: item.projectId, status: item.status };
    return {
      id: `task-${item.id}`,
      title: item.title,
      start: item.start,
      // docs/API.md task ranges are inclusive; FullCalendar's all-day `end` is exclusive.
      end: addDays(item.end, 1),
      allDay: true,
      classNames: item.status === 'DONE' ? ['fc-event-task', 'fc-event-task-done'] : ['fc-event-task'],
      extendedProps: props,
    };
  }
  const props: CalendarEventProps = { kind: 'meeting', id: item.id, projectId: item.projectId };
  return {
    id: `meeting-${item.id}`,
    title: item.title,
    start: item.start,
    end: item.end,
    allDay: false,
    // Render as a block (not a dot) in the month grid so meetings read as distinct from tasks.
    display: 'block',
    classNames: ['fc-event-meeting'],
    extendedProps: props,
  };
}
