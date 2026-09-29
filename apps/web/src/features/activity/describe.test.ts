import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '@/types/domain';
import { activityHref, describeActivity } from './describe';

const nameOf = (id: string | null) => (id === 'u2' ? 'Luis Pérez' : 'Alguien');

function event(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: 'e1',
    projectId: 'p1',
    actorId: 'u1',
    type: 'TASK_COMPLETED',
    entityType: 'Task',
    entityId: 't1',
    metadata: null,
    createdAt: '2026-09-28T15:00:00Z',
    ...overrides,
  };
}

describe('describeActivity', () => {
  it('quotes names the API provides', () => {
    expect(describeActivity(event({ type: 'TASK_CREATED', metadata: { title: 'Login' } }), nameOf)).toBe('creó la tarea «Login»');
    expect(describeActivity(event({ type: 'DOCUMENT_UPLOADED', metadata: { originalName: 'spec.pdf' } }), nameOf)).toBe(
      'subió el documento «spec.pdf»',
    );
  });

  it('falls back to a generic sentence when metadata is missing', () => {
    expect(describeActivity(event({ type: 'TASK_CREATED', metadata: null }), nameOf)).toBe('creó una tarea');
    expect(describeActivity(event({ type: 'TASK_COMPLETED' }), nameOf)).toBe('completó una tarea');
  });

  it('names the affected member and role for membership events', () => {
    expect(
      describeActivity(event({ type: 'PROJECT_MEMBER_ADDED', entityId: 'u2', metadata: { role: 'MANAGER' } }), nameOf),
    ).toBe('añadió a Luis Pérez al proyecto como Manager');
    expect(describeActivity(event({ type: 'PROJECT_MEMBER_REMOVED', entityId: 'u2' }), nameOf)).toBe(
      'retiró a Luis Pérez del proyecto',
    );
  });

  it('lists only recognizable edited fields', () => {
    expect(
      describeActivity(event({ type: 'TASK_UPDATED', metadata: { fields: ['title', 'dueDate', 'title', 'weird'] } }), nameOf),
    ).toBe('editó una tarea (título, vencimiento)');
    expect(describeActivity(event({ type: 'TASK_UPDATED', metadata: { fields: ['weird'] } }), nameOf)).toBe('editó una tarea');
  });
});

describe('activityHref', () => {
  it('opens the task or meeting detail through the shared query param', () => {
    expect(activityHref(event({ type: 'TASK_COMPLETED', entityId: 't1' }))).toBe('/projects/p1/tasks?taskId=t1');
    expect(activityHref(event({ type: 'MEETING_NOTES_UPDATED', entityId: 'm1' }))).toBe('/projects/p1/meetings?meetingId=m1');
  });

  it('has no destination for deleted subjects', () => {
    expect(activityHref(event({ type: 'TASK_DELETED' }))).toBeNull();
    expect(activityHref(event({ type: 'MEETING_DELETED' }))).toBeNull();
    expect(activityHref(event({ type: 'DOCUMENT_DELETED' }))).toBeNull();
    expect(activityHref(event({ type: 'PROJECT_DELETED' }))).toBeNull();
  });
});
