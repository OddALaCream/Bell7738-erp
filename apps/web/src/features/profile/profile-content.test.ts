import { describe, expect, it } from 'vitest';
import type { CalendarItem, ProjectSummary } from '@/types/domain';
import { buildOwnProfileContent, isProfilePopulated } from './profile-content';

const task = (id: string, end: string, status: 'PENDING' | 'IN_PROGRESS' | 'DONE'): CalendarItem => ({
  kind: 'task',
  id,
  projectId: 'p1',
  title: id,
  start: '2026-09-01',
  end,
  status,
});

const project = (id: string, status: ProjectSummary['status']): ProjectSummary => ({
  id,
  name: id,
  description: null,
  clientName: null,
  status,
  startDate: null,
  expectedEndDate: null,
  completedAt: null,
  createdById: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('buildOwnProfileContent', () => {
  it('splits tasks into active (by due date) and finished (most recent first)', () => {
    const content = buildOwnProfileContent(
      [
        task('later', '2026-10-10', 'PENDING'),
        task('soon', '2026-09-29', 'IN_PROGRESS'),
        task('old-done', '2026-08-01', 'DONE'),
        task('new-done', '2026-09-20', 'DONE'),
      ],
      [],
      [],
    );
    expect(content.activeTasks.map((t) => t.id)).toEqual(['soon', 'later']);
    expect(content.completedTasks.map((t) => t.id)).toEqual(['new-done', 'old-done']);
  });

  it('ignores meetings and caps finished tasks', () => {
    const many = Array.from({ length: 15 }, (_, index) => task(`d${index}`, `2026-09-${String(index + 1).padStart(2, '0')}`, 'DONE'));
    const content = buildOwnProfileContent(
      [{ kind: 'meeting', id: 'm', projectId: 'p1', title: 'm', start: '2026-09-28T10:00:00Z', end: '2026-09-28T11:00:00Z' }, ...many],
      [],
      [],
    );
    expect(content.completedTasks).toHaveLength(10);
    expect(content.completedTasks[0]?.id).toBe('d14');
    expect(content.activeTasks).toHaveLength(0);
  });

  it('separates ongoing from ended projects', () => {
    const content = buildOwnProfileContent(
      [],
      [project('planned', 'PLANNED'), project('active', 'ACTIVE'), project('paused', 'PAUSED'), project('done', 'COMPLETED'), project('cancelled', 'CANCELLED')],
      [],
    );
    expect(content.activeProjects.map((p) => p.id)).toEqual(['planned', 'active', 'paused']);
    expect(content.pastProjects.map((p) => p.id)).toEqual(['done', 'cancelled']);
  });
});

describe('isProfilePopulated', () => {
  const empty = { roles: [], activeProjects: [], pastProjects: [], activeTasks: [], completedTasks: [] };

  it('is false for the empty lists the server sends today', () => {
    expect(isProfilePopulated(empty)).toBe(false);
  });

  it('is true as soon as any list has content', () => {
    expect(isProfilePopulated({ ...empty, roles: ['Developer'] })).toBe(true);
    expect(isProfilePopulated({ ...empty, activeTasks: [{}] })).toBe(true);
  });
});
