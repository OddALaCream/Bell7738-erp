import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '@/types/domain';
import { nextMeetings, prioritizeTasks } from './logic';

type TaskItem = Extract<CalendarItem, { kind: 'task' }>;

const task = (id: string, end: string, status: TaskItem['status'] = 'PENDING'): TaskItem => ({
  kind: 'task',
  id,
  projectId: 'p1',
  title: id,
  start: '2026-09-01',
  end,
  status,
});

const meeting = (id: string, start: string, end: string): CalendarItem => ({
  kind: 'meeting',
  id,
  projectId: 'p1',
  title: id,
  start,
  end,
});

describe('prioritizeTasks', () => {
  const today = '2026-09-28';

  it('puts overdue tasks first, then upcoming by due date', () => {
    const result = prioritizeTasks(
      [task('later', '2026-10-10'), task('overdue-recent', '2026-09-27'), task('soon', '2026-09-29'), task('overdue-old', '2026-09-01')],
      today,
      10,
    );
    expect(result.map((t) => t.id)).toEqual(['overdue-old', 'overdue-recent', 'soon', 'later']);
  });

  it('treats a task due today as upcoming, not overdue', () => {
    const result = prioritizeTasks([task('today', '2026-09-28'), task('overdue', '2026-09-20')], today, 10);
    expect(result.map((t) => t.id)).toEqual(['overdue', 'today']);
  });

  it('drops finished tasks and honors the limit', () => {
    const result = prioritizeTasks([task('done', '2026-09-01', 'DONE'), task('a', '2026-09-30'), task('b', '2026-10-01')], today, 1);
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('reads due dates that arrive as full ISO instants', () => {
    const result = prioritizeTasks([task('x', '2026-09-27T00:00:00.000Z')], today, 5);
    expect(result).toHaveLength(1);
  });
});

describe('nextMeetings', () => {
  const now = Date.parse('2026-09-28T15:30:00Z');

  it('keeps meetings that are ahead or in progress, soonest first', () => {
    const result = nextMeetings(
      [
        meeting('finished', '2026-09-28T13:00:00Z', '2026-09-28T14:00:00Z'),
        meeting('tomorrow', '2026-09-29T15:00:00Z', '2026-09-29T16:00:00Z'),
        meeting('live', '2026-09-28T15:00:00Z', '2026-09-28T16:00:00Z'),
      ],
      now,
      5,
    );
    expect(result.map((m) => m.id)).toEqual(['live', 'tomorrow']);
  });

  it('ignores tasks and honors the limit', () => {
    const result = nextMeetings(
      [task('t', '2026-09-30'), meeting('a', '2026-09-29T10:00:00Z', '2026-09-29T11:00:00Z'), meeting('b', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z')],
      now,
      1,
    );
    expect(result.map((m) => m.id)).toEqual(['a']);
  });
});
