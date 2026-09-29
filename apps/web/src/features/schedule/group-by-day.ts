import { addDays, formatDateOnly, instantToLocalDay, toDateOnly } from '@/lib/dates';
import type { CalendarItem } from '@/types/domain';

export interface DayGroup {
  day: string;
  items: CalendarItem[];
}

/**
 * The API orders by start instant, but a meeting's UTC instant can land on a
 * different calendar day than the user's, so regroup by the *local* day.
 * A task that started before the window is filed under the window's first day
 * so a long-running task doesn't surface under an old, out-of-range heading.
 */
export function groupByLocalDay(items: CalendarItem[], windowStart: string): DayGroup[] {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const day =
      item.kind === 'task'
        ? toDateOnly(item.start) < windowStart
          ? windowStart
          : toDateOnly(item.start)
        : instantToLocalDay(item.start);
    const list = groups.get(day);
    if (list) list.push(item);
    else groups.set(day, [item]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      // All-day tasks first, then meetings by start time.
      items: [...list].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
        return a.kind === 'meeting' && b.kind === 'meeting' ? Date.parse(a.start) - Date.parse(b.start) : 0;
      }),
    }));
}

export function dayHeading(day: string, today: string): string {
  if (day === today) return 'Hoy';
  if (day === addDays(today, 1)) return 'Mañana';
  if (day === addDays(today, -1)) return 'Ayer';
  return formatDateOnly(day, { weekday: 'long', day: 'numeric', month: 'long' });
}
