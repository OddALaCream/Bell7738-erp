import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '@/types/domain';
import { dayHeading, groupByLocalDay } from './group-by-day';

const task = (id: string, start: string, end: string): CalendarItem => ({
  kind: 'task',
  id,
  projectId: 'p1',
  title: id,
  start,
  end,
  status: 'PENDING',
});

const meeting = (id: string, start: string, end: string): CalendarItem => ({
  kind: 'meeting',
  id,
  projectId: 'p1',
  title: id,
  start,
  end,
});

describe('groupByLocalDay (TZ=America/Guayaquil, UTC-5)', () => {
  it('files a late-evening meeting under the local day, not the UTC day', () => {
    // 20:00 local on 28 Sep is 01:00Z on 29 Sep.
    const groups = groupByLocalDay([meeting('m', '2026-09-29T01:00:00Z', '2026-09-29T02:00:00Z')], '2026-09-20');
    expect(groups.map((g) => g.day)).toEqual(['2026-09-28']);
  });

  it('puts all-day tasks before meetings and orders meetings by time', () => {
    const groups = groupByLocalDay(
      [
        meeting('late', '2026-09-28T20:00:00Z', '2026-09-28T21:00:00Z'),
        meeting('early', '2026-09-28T15:00:00Z', '2026-09-28T16:00:00Z'),
        task('t', '2026-09-28', '2026-09-30'),
      ],
      '2026-09-20',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['t', 'early', 'late']);
  });

  it('files a task that began before the window under the first day of the window', () => {
    const groups = groupByLocalDay([task('long', '2026-08-01', '2026-10-15')], '2026-09-21');
    expect(groups.map((g) => g.day)).toEqual(['2026-09-21']);
  });

  it('sorts days chronologically', () => {
    const groups = groupByLocalDay([task('b', '2026-09-30', '2026-09-30'), task('a', '2026-09-25', '2026-09-25')], '2026-09-20');
    expect(groups.map((g) => g.day)).toEqual(['2026-09-25', '2026-09-30']);
  });
});

describe('dayHeading', () => {
  it('names today, tomorrow and yesterday', () => {
    expect(dayHeading('2026-09-28', '2026-09-28')).toBe('Hoy');
    expect(dayHeading('2026-09-29', '2026-09-28')).toBe('Mañana');
    expect(dayHeading('2026-09-27', '2026-09-28')).toBe('Ayer');
  });

  it('falls back to a long date otherwise', () => {
    expect(dayHeading('2026-10-05', '2026-09-28')).toMatch(/5/);
  });
});
