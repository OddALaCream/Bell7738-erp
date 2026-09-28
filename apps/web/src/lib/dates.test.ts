import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  diffInDays,
  formatDateOnly,
  formatDateOnlyRange,
  instantToLocalDay,
  instantToLocalInput,
  isBeforeToday,
  localDateOnly,
  localInputToInstant,
  parseDateOnly,
  toDateOnly,
} from './dates';

// vitest.config.ts pins TZ=America/Guayaquil (UTC-5): the zone where a
// `...T00:00:00Z` calendar date renders as the previous day through `new Date`.
describe('calendar dates', () => {
  it('keeps only the date part of bare and ISO-instant values', () => {
    expect(toDateOnly('2026-09-28')).toBe('2026-09-28');
    expect(toDateOnly('2026-09-28T00:00:00.000Z')).toBe('2026-09-28');
  });

  it('formats an ISO-instant calendar date as the same day, not the previous one', () => {
    expect(new Date('2026-09-28T00:00:00.000Z').getDate()).toBe(27); // the pitfall being guarded against
    expect(parseDateOnly('2026-09-28T00:00:00.000Z').getDate()).toBe(28);
    expect(formatDateOnly('2026-09-28T00:00:00.000Z', { day: 'numeric' })).toBe('28');
  });

  it('formats a range, collapsing a single day', () => {
    expect(formatDateOnlyRange('2026-09-28', '2026-09-28')).toBe(formatDateOnly('2026-09-28', { day: 'numeric', month: 'short' }));
    expect(formatDateOnlyRange('2026-09-28', '2026-10-02')).toContain('–');
  });

  it('does calendar arithmetic across month and DST boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-09-28T00:00:00.000Z', 3)).toBe('2026-10-01');
    expect(diffInDays('2026-09-28', '2026-10-02')).toBe(4);
    expect(diffInDays('2026-10-02', '2026-09-28')).toBe(-4);
  });
});

describe('isBeforeToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 21:00 local on 28 Sep = 02:00Z on 29 Sep: UTC has already rolled over, the user's day hasn't.
    vi.setSystemTime(new Date('2026-09-29T02:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('uses the local day, not the UTC day', () => {
    expect(localDateOnly(new Date())).toBe('2026-09-28');
  });

  it('does not flag a task due today as overdue', () => {
    expect(isBeforeToday('2026-09-28')).toBe(false);
    expect(isBeforeToday('2026-09-28T00:00:00.000Z')).toBe(false);
  });

  it('flags a task due yesterday', () => {
    expect(isBeforeToday('2026-09-27')).toBe(true);
  });
});

describe('instants', () => {
  it('maps a late-evening local meeting to its local day, not the UTC day', () => {
    // 20:00 local on 28 Sep = 01:00Z on 29 Sep
    expect(instantToLocalDay('2026-09-29T01:00:00Z')).toBe('2026-09-28');
  });

  it('round-trips a datetime-local value through a UTC instant', () => {
    const instant = localInputToInstant('2026-09-28T20:00');
    expect(instant).toBe('2026-09-29T01:00:00.000Z');
    expect(instantToLocalInput(instant)).toBe('2026-09-28T20:00');
  });
});
