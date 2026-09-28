/**
 * Date helpers that keep the two kinds of dates in docs/PRODUCT.md apart:
 *
 * - Calendar dates (`startDate`, `dueDate`, project dates): a day, no time
 *   zone. The API may send `YYYY-MM-DD` or a full `...T00:00:00.000Z`
 *   instant (docs/FRONTEND_BACKEND_GAPS.md), so only the first 10 chars are
 *   meaningful. Never run them through `new Date(value)` for display: in a
 *   UTC-negative zone that shows the previous day.
 * - Instants (meeting `startsAt`, `createdAt`): shown in the user's zone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCALE = 'es';

/** Keeps only `YYYY-MM-DD` of a calendar date. */
export function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

/** `YYYY-MM-DD` of a `Date`, read in the user's local zone. */
export function localDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayDateOnly(): string {
  return localDateOnly(new Date());
}

/** Local-midnight `Date` for a calendar date, safe to pass to `Intl`/`toLocale*`. */
export function parseDateOnly(value: string): Date {
  const [year = 0, month = 1, day = 1] = toDateOnly(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Calendar-day arithmetic that ignores DST (works on the UTC representation). */
export function addDays(value: string, days: number): string {
  const [year = 0, month = 1, day = 1] = toDateOnly(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both calendar dates); negative if `to` is earlier. */
export function diffInDays(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = toDateOnly(from).split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = toDateOnly(to).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** A calendar date strictly before today (a task due today is not overdue). */
export function isBeforeToday(value: string): boolean {
  return toDateOnly(value) < todayDateOnly();
}

export function formatDateOnly(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return parseDateOnly(value).toLocaleDateString(LOCALE, options);
}

export function formatDateOnlyRange(start: string, end: string): string {
  const short: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (toDateOnly(start) === toDateOnly(end)) return formatDateOnly(start, short);
  return `${formatDateOnly(start, short)} – ${formatDateOnly(end, short)}`;
}

/** Local calendar day (`YYYY-MM-DD`) that an instant falls on. */
export function instantToLocalDay(instant: string): string {
  return localDateOnly(new Date(instant));
}

/** Whether an instant is already behind us (evaluated at call time). */
export function isPastInstant(instant: string): boolean {
  return Date.parse(instant) < Date.now();
}

export function formatTime(instant: string): string {
  return new Date(instant).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(instant: string): string {
  return new Date(instant).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Short zone label (e.g. "GMT-5") so meeting times are never ambiguous. */
export function localTimeZoneLabel(): string {
  const part = new Intl.DateTimeFormat(LOCALE, { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** `<input type="datetime-local">` value (local) for an instant. */
export function instantToLocalInput(instant: string): string {
  const date = new Date(instant);
  return `${localDateOnly(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Converts a `datetime-local` value (local time) into a UTC ISO instant for the API. */
export function localInputToInstant(value: string): string {
  return new Date(value).toISOString();
}
