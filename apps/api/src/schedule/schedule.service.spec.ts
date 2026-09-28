import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScheduleService } from './schedule.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAccessService } from '../projects/project-access.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const actor: AuthenticatedUser = {
  id: 'actor-1',
  email: 'actor@example.com',
  isOwner: false,
  sessionId: 's1',
};

const baseTask = {
  id: 'task-1',
  projectId: 'proj-1',
  title: 'Task one',
  startDate: new Date('2026-01-01'),
  dueDate: new Date('2026-01-05'),
  status: 'PENDING' as const,
  assignees: [],
};

const baseMeeting = {
  id: 'meeting-1',
  projectId: 'proj-1',
  title: 'Meeting one',
  startsAt: new Date('2026-01-03T10:00:00Z'),
  endsAt: new Date('2026-01-03T11:00:00Z'),
};

function makeService(overrides?: {
  canView?: boolean;
  tasks?: unknown[];
  meetings?: unknown[];
  permissionKeys?: string[];
}) {
  const prisma = {
    task: {
      findMany: vi.fn().mockResolvedValue(overrides?.tasks ?? [baseTask]),
      count: vi.fn().mockResolvedValue((overrides?.tasks ?? [baseTask]).length),
    },
    meeting: {
      findMany: vi.fn().mockResolvedValue(overrides?.meetings ?? [baseMeeting]),
      count: vi
        .fn()
        .mockResolvedValue((overrides?.meetings ?? [baseMeeting]).length),
    },
  } as unknown as PrismaService;

  const access = {
    assertCanViewProject:
      overrides?.canView === false
        ? vi.fn().mockRejectedValue(new NotFoundException())
        : vi.fn().mockResolvedValue({ id: 'proj-1' }),
  } as unknown as ProjectAccessService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(
        new Set(overrides?.permissionKeys ?? ['PROJECTS_VIEW_ASSIGNED']),
      ),
  } as unknown as EffectivePermissionsService;

  return {
    service: new ScheduleService(prisma, access, effectivePermissions),
    prisma,
    access,
    effectivePermissions,
  };
}

describe('ScheduleService.timeline', () => {
  it('requires visibility of the project', async () => {
    const { service, access } = makeService();
    await service.timeline('proj-1', { page: 1, pageSize: 100 }, actor);
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });

  it('propagates the 404 from assertCanViewProject', async () => {
    const { service } = makeService({ canView: false });
    await expect(
      service.timeline('proj-1', { page: 1, pageSize: 100 }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters by status and assigneeId when provided', async () => {
    const { service, prisma } = makeService();
    await service.timeline(
      'proj-1',
      { page: 1, pageSize: 100, status: 'DONE', assigneeId: 'user-9' },
      actor,
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'DONE',
          assignees: { some: { userId: 'user-9' } },
        }),
      }),
    );
  });

  it('rejects an inverted optional range', async () => {
    const { service } = makeService();
    await expect(
      service.timeline(
        'proj-1',
        {
          from: '2026-01-10',
          to: '2026-01-01',
          page: 1,
          pageSize: 25,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps DONE tasks visible unless status is explicitly filtered', async () => {
    const doneTask = { ...baseTask, status: 'DONE' as const };
    const { service, prisma } = makeService({ tasks: [doneTask] });
    const result = await service.timeline(
      'proj-1',
      { page: 1, pageSize: 25 },
      actor,
    );
    const call = (prisma.task.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where).not.toHaveProperty('status');
    expect(result.data).toEqual([
      expect.objectContaining({
        status: 'DONE',
        startDate: '2026-01-01',
        dueDate: '2026-01-05',
      }),
    ]);
  });
});

describe('ScheduleService.calendar', () => {
  it('requires visibility of the project', async () => {
    const { service, access } = makeService();
    await service.calendar(
      'proj-1',
      { from: '2026-01-01', to: '2026-01-10' },
      actor,
    );
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });

  it('rejects a to before from', async () => {
    const { service } = makeService();
    await expect(
      service.calendar(
        'proj-1',
        { from: '2026-01-10', to: '2026-01-01' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a range wider than the configured maximum', async () => {
    const { service } = makeService();
    await expect(
      service.calendar(
        'proj-1',
        { from: '2026-01-01', to: '2026-12-31' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a chronologically merged discriminated union of tasks and meetings', async () => {
    const { service } = makeService({
      tasks: [baseTask],
      meetings: [baseMeeting],
    });
    const result = await service.calendar(
      'proj-1',
      { from: '2026-01-01', to: '2026-01-10' },
      actor,
    );
    expect(result).toEqual([
      expect.objectContaining({ kind: 'task', id: 'task-1' }),
      expect.objectContaining({ kind: 'meeting', id: 'meeting-1' }),
    ]);
  });

  it('includes a meeting starting later on the "to" day (end-of-day boundary)', async () => {
    const lateMeeting = {
      ...baseMeeting,
      id: 'meeting-late',
      startsAt: new Date('2026-01-10T23:00:00Z'),
      endsAt: new Date('2026-01-10T23:30:00Z'),
    };
    const { service, prisma } = makeService({
      tasks: [],
      meetings: [lateMeeting],
    });
    const result = await service.calendar(
      'proj-1',
      { from: '2026-01-01', to: '2026-01-10' },
      actor,
    );
    expect(result).toHaveLength(1);
    const call = (prisma.meeting.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where.startsAt.lt.getTime()).toBeGreaterThan(
      new Date('2026-01-10T23:00:00Z').getTime(),
    );
  });

  it('excludes soft-deleted tasks, meetings, and parent projects in both queries', async () => {
    const { service, prisma } = makeService();
    await service.calendar(
      'proj-1',
      { from: '2026-01-01', to: '2026-01-10' },
      actor,
    );
    const taskCall = (prisma.task.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const meetingCall = (prisma.meeting.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(taskCall.where).toEqual(
      expect.objectContaining({
        deletedAt: null,
        project: { deletedAt: null },
      }),
    );
    expect(meetingCall.where).toEqual(
      expect.objectContaining({
        deletedAt: null,
        project: { deletedAt: null },
      }),
    );
  });
});

describe('ScheduleService.mySchedule', () => {
  it("scopes tasks to the actor's own assignments", async () => {
    const { service, prisma } = makeService();
    await service.mySchedule(
      { kind: 'all', view: 'list', page: 1, pageSize: 25 },
      actor,
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignees: { some: { userId: actor.id } },
          project: {
            deletedAt: null,
            members: {
              some: { userId: actor.id, removedAt: null },
            },
          },
        }),
      }),
    );
  });

  it("scopes meetings to the actor's own participation", async () => {
    const { service, prisma } = makeService();
    await service.mySchedule(
      { kind: 'all', view: 'list', page: 1, pageSize: 25 },
      actor,
    );
    expect(prisma.meeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participants: { some: { userId: actor.id } },
          project: {
            deletedAt: null,
            members: {
              some: { userId: actor.id, removedAt: null },
            },
          },
        }),
      }),
    );
  });

  it('skips the meeting query entirely when kind=task', async () => {
    const { service, prisma } = makeService();
    await service.mySchedule(
      { kind: 'task', view: 'list', page: 1, pageSize: 25 },
      actor,
    );
    expect(prisma.meeting.findMany).not.toHaveBeenCalled();
  });

  it('skips the task query entirely when kind=meeting', async () => {
    const { service, prisma } = makeService();
    await service.mySchedule(
      { kind: 'meeting', view: 'list', page: 1, pageSize: 25 },
      actor,
    );
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('paginates the merged, chronologically-sorted result', async () => {
    const earlierMeeting = {
      ...baseMeeting,
      id: 'meeting-early',
      startsAt: new Date('2025-12-01T00:00:00Z'),
      endsAt: new Date('2025-12-01T01:00:00Z'),
    };
    const { service } = makeService({
      tasks: [baseTask],
      meetings: [earlierMeeting],
    });
    const result = await service.mySchedule(
      { kind: 'all', view: 'list', page: 1, pageSize: 1 },
      actor,
    );
    expect(result.meta.total).toBe(2);
    expect(result.data).toHaveLength(1);
    expect((result.data[0] as { kind: string }).kind).toBe('meeting');
  });

  it('returns an empty page without resource queries when project visibility is absent', async () => {
    const { service, prisma } = makeService({ permissionKeys: [] });
    const result = await service.mySchedule(
      { kind: 'all', view: 'list', page: 2, pageSize: 25 },
      actor,
    );
    expect(result).toEqual({
      data: [],
      meta: { page: 2, pageSize: 25, total: 0, totalPages: 0 },
    });
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.meeting.findMany).not.toHaveBeenCalled();
  });

  it('allows PROJECTS_VIEW_ALL without requiring project membership', async () => {
    const { service, prisma } = makeService({
      permissionKeys: ['PROJECTS_VIEW_ALL'],
    });
    await service.mySchedule(
      { kind: 'all', view: 'calendar', page: 1, pageSize: 25 },
      actor,
    );
    const call = (prisma.task.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where.project).toEqual({ deletedAt: null });
  });

  it('rejects an inverted date range', async () => {
    const { service } = makeService();
    await expect(
      service.mySchedule(
        {
          kind: 'all',
          view: 'list',
          from: '2026-01-10',
          to: '2026-01-01',
          page: 1,
          pageSize: 25,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses database pagination for a single kind', async () => {
    const { service, prisma } = makeService({ meetings: [] });
    await service.mySchedule(
      { kind: 'task', view: 'list', page: 3, pageSize: 10 },
      actor,
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});
