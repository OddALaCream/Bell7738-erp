import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { ProjectAccessService } from '../projects/project-access.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const owner: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  isOwner: true,
  sessionId: 's1',
};
const actor: AuthenticatedUser = {
  id: 'actor-1',
  email: 'actor@example.com',
  isOwner: false,
  sessionId: 's2',
};

const baseTask = {
  id: 'task-1',
  projectId: 'proj-1',
  title: 'Do the thing',
  description: null,
  startDate: new Date('2026-01-01'),
  dueDate: new Date('2026-01-10'),
  status: 'PENDING' as const,
  createdById: 'creator-1',
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  assignees: [] as Array<{ userId: string; assignedAt: Date; user: unknown }>,
};

function makeService(overrides?: {
  effectiveKeys?: Set<string>;
  membership?: { role: 'MANAGER' | 'MEMBER' | 'VIEWER' } | null;
  hasMemberLevelAccess?: boolean;
  task?: unknown;
  activeUsers?: Array<{ id: string }>;
  activeMembers?: Array<{ userId: string }>;
  updateManyCount?: number;
}) {
  const taskCreate = vi.fn().mockResolvedValue({ id: 'task-1' });
  const taskAssigneeCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const taskAssigneeDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const txProjectQueryRaw = vi.fn().mockResolvedValue([{ deletedAt: null }]);
  const txTaskFindFirst = vi
    .fn()
    .mockResolvedValue(
      overrides?.task !== undefined ? overrides.task : baseTask,
    );
  const txTaskFindUniqueOrThrow = vi
    .fn()
    .mockResolvedValue(
      overrides?.task !== undefined ? overrides.task : baseTask,
    );

  const tx = {
    $queryRaw: txProjectQueryRaw,
    task: {
      create: taskCreate,
      findFirst: txTaskFindFirst,
      findUniqueOrThrow: txTaskFindUniqueOrThrow,
    },
    taskAssignee: {
      createMany: taskAssigneeCreateMany,
      deleteMany: taskAssigneeDeleteMany,
    },
  };

  const prisma = {
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides?.task !== undefined ? overrides.task : baseTask,
        ),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue(
          overrides?.task !== undefined ? overrides.task : baseTask,
        ),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides?.updateManyCount ?? 1 }),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue(overrides?.activeUsers ?? [{ id: 'assignee-1' }]),
    },
    projectMember: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          overrides?.activeMembers ?? [{ userId: 'assignee-1' }],
        ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(overrides?.effectiveKeys ?? new Set<string>()),
  } as unknown as EffectivePermissionsService;

  const access = {
    assertCanViewProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    getActiveMembership: vi
      .fn()
      .mockResolvedValue(
        overrides?.membership !== undefined
          ? overrides.membership
          : { role: 'MEMBER' },
      ),
    canManageProject: vi.fn().mockResolvedValue(true),
    hasMemberLevelAccess: vi
      .fn()
      .mockResolvedValue(overrides?.hasMemberLevelAccess ?? true),
  } as unknown as ProjectAccessService;

  const notifications = {
    notifyTaskAssigned: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;

  const activity = {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as ActivityService;

  return {
    service: new TasksService(
      prisma,
      effectivePermissions,
      access,
      notifications,
      activity,
    ),
    prisma,
    activity,
    access,
    effectivePermissions,
    notifications,
    tx,
  };
}

const createDto = {
  title: 'New task',
  startDate: '2026-01-01',
  dueDate: '2026-01-10',
  assigneeIds: ['assignee-1'],
};

describe('TasksService.create', () => {
  it('rejects when the actor lacks member-level access (TASKS_CREATE + MEMBER/MANAGER/override)', async () => {
    const { service } = makeService({ hasMemberLevelAccess: false });
    await expect(
      service.create('proj-1', createDto, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a dueDate before startDate', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        'proj-1',
        { ...createDto, startDate: '2026-01-10', dueDate: '2026-01-01' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an assignee who is not an active user or current project member', async () => {
    const { service } = makeService({ activeUsers: [] });
    await expect(
      service.create('proj-1', createDto, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates the task and its assignees transactionally', async () => {
    const { service, prisma, tx } = makeService();
    await service.create('proj-1', createDto, actor);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.taskAssignee.createMany).toHaveBeenCalledWith({
      data: [
        { taskId: 'task-1', userId: 'assignee-1', assignedById: actor.id },
      ],
    });
  });

  // Regression coverage: Prisma's @db.Date columns reject a bare
  // 'YYYY-MM-DD' string at the driver level (this was only ever caught by
  // e2e tests against real Postgres, not by mocked unit tests) — assert the
  // service converts the DTO's date strings to real Date instances.
  it('converts startDate/dueDate strings to Date instances before writing', async () => {
    const { service, tx } = makeService();
    await service.create('proj-1', createDto, actor);
    const call = (tx.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.startDate).toBeInstanceOf(Date);
    expect(call.data.dueDate).toBeInstanceOf(Date);
  });

  it('allows the Owner unconditionally', async () => {
    const { service } = makeService();
    await expect(
      service.create('proj-1', createDto, owner),
    ).resolves.toBeDefined();
  });

  it('notifies each assignee of the new task', async () => {
    const { service, notifications } = makeService();
    await service.create('proj-1', createDto, actor);
    expect(notifications.notifyTaskAssigned).toHaveBeenCalledWith({
      userId: 'assignee-1',
      actorId: actor.id,
      projectId: 'proj-1',
      taskId: 'task-1',
    });
  });
});

describe('TasksService.update', () => {
  it('denies a creator demoted to VIEWER even with TASKS_UPDATE', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      membership: { role: 'VIEWER' },
      task: { ...baseTask, createdById: actor.id },
    });
    await expect(
      service.update('proj-1', 'task-1', { title: 'Changed' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });
  const dto = { title: 'Renamed' };

  it('rejects a non-creator, non-manager actor without override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.update('proj-1', 'task-1', dto, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the creator with TASKS_UPDATE', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id },
    });
    await expect(
      service.update('proj-1', 'task-1', dto, actor),
    ).resolves.toBeDefined();
  });

  it('allows a MANAGER with TASKS_UPDATE even if not the creator', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.update('proj-1', 'task-1', dto, actor),
    ).resolves.toBeDefined();
  });

  it('rejects changing status on an already-DONE task via PATCH, pointing to reopen', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id, status: 'DONE' },
    });
    await expect(
      service.update('proj-1', 'task-1', { status: 'IN_PROGRESS' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows editing content of a DONE task without touching status', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id, status: 'DONE' },
    });
    await expect(
      service.update('proj-1', 'task-1', { title: 'Fix typo' }, actor),
    ).resolves.toBeDefined();
  });

  it('rejects a dueDate/startDate merge that becomes invalid', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: {
        ...baseTask,
        createdById: actor.id,
        dueDate: new Date('2026-01-10'),
      },
    });
    await expect(
      service.update('proj-1', 'task-1', { startDate: '2026-02-01' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s if the task was deleted concurrently', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id },
      updateManyCount: 0,
    });
    await expect(
      service.update('proj-1', 'task-1', dto, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // Regression coverage for a Phase 8 Codex adversarial review finding: the
  // write must be conditioned on the PARENT PROJECT still being live too,
  // not just the task, so a concurrent project soft-delete can't slip a
  // mutation through between the visibility check and this write.
  it('conditions the write on the project also still being non-deleted', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id },
    });
    await service.update('proj-1', 'task-1', dto, actor);
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ project: { deletedAt: null } }),
      }),
    );
  });
});

describe('TasksService.complete', () => {
  it('denies an assignee demoted to VIEWER even with TASKS_COMPLETE', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_COMPLETE']),
      membership: { role: 'VIEWER' },
      task: { ...baseTask, assignees: [{ userId: actor.id }] },
    });
    await expect(
      service.complete('proj-1', 'task-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects an actor who is not an assignee, MANAGER, or override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_COMPLETE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.complete('proj-1', 'task-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an assignee with TASKS_COMPLETE', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_COMPLETE']),
      task: {
        ...baseTask,
        assignees: [{ userId: actor.id, assignedAt: new Date(), user: {} }],
      },
    });
    await expect(
      service.complete('proj-1', 'task-1', actor),
    ).resolves.toBeDefined();
  });

  it('allows a MANAGER with TASKS_COMPLETE even if not assigned', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_COMPLETE']),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.complete('proj-1', 'task-1', actor),
    ).resolves.toBeDefined();
  });

  it('is idempotent when the task is already DONE', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['TASKS_COMPLETE']),
      membership: { role: 'MANAGER' },
      task: {
        ...baseTask,
        status: 'DONE',
        completedAt: new Date('2026-01-05'),
      },
    });
    const result = await service.complete('proj-1', 'task-1', actor);
    expect(result).toBeDefined();
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'DONE' } }),
      }),
    );
  });
});

describe('TasksService.reopen', () => {
  it('rejects a plain creator without MANAGER/override (stricter than edit)', async () => {
    const { service, access } = makeService();
    (access.canManageProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      false,
    );
    await expect(
      service.reopen('proj-1', 'task-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reopening a task that is not currently DONE', async () => {
    const { service } = makeService({
      updateManyCount: 0,
      task: { ...baseTask, status: 'PENDING' },
    });
    await expect(
      service.reopen('proj-1', 'task-1', actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reopens a DONE task for a MANAGER/override actor', async () => {
    const { service, prisma } = makeService({
      task: { ...baseTask, status: 'DONE' },
    });
    await service.reopen('proj-1', 'task-1', actor);
    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'IN_PROGRESS', completedAt: null },
      }),
    );
  });
});

describe('TasksService.delete', () => {
  it('rejects a non-manager, non-override actor', async () => {
    const { service, access } = makeService();
    (access.canManageProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      false,
    );
    await expect(
      service.delete('proj-1', 'task-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('soft-deletes via a conditional updateMany', async () => {
    const { service, prisma } = makeService();
    await service.delete('proj-1', 'task-1', actor);
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        projectId: 'proj-1',
        deletedAt: null,
        project: { deletedAt: null },
      },
      data: { deletedAt: expect.any(Date), deletedById: actor.id },
    });
  });

  it('404s if already deleted concurrently', async () => {
    const { service } = makeService({ updateManyCount: 0 });
    await expect(
      service.delete('proj-1', 'task-1', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TasksService.setAssignees', () => {
  const dto = { assigneeIds: ['assignee-1'] };

  it('rejects a non-creator, non-manager actor without override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.setAssignees('proj-1', 'task-1', dto, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an invalid assignee set', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id },
      activeMembers: [],
    });
    await expect(
      service.setAssignees('proj-1', 'task-1', dto, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces the assignee set transactionally', async () => {
    const { service, tx } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id },
    });
    await service.setAssignees('proj-1', 'task-1', dto, actor);
    expect(tx.taskAssignee.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
    });
    expect(tx.taskAssignee.createMany).toHaveBeenCalledWith({
      data: [
        { taskId: 'task-1', userId: 'assignee-1', assignedById: actor.id },
      ],
    });
  });

  // Regression coverage for a Phase 8 Codex adversarial review finding: the
  // final response must re-check liveness rather than trusting the earlier
  // `stillLive` read, since a concurrent soft-delete of the task or its
  // project could commit between that check and these writes.
  it('404s if the task or its project was deleted between the liveness check and the write', async () => {
    const { service, tx } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: { ...baseTask, createdById: actor.id },
    });
    (tx.task.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(baseTask) // initial stillLive check
      .mockResolvedValueOnce(null); // final re-check after the writes
    await expect(
      service.setAssignees('proj-1', 'task-1', dto, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('notifies only newly-added assignees, not ones already assigned before the replacement', async () => {
    const { service, notifications } = makeService({
      effectiveKeys: new Set(['TASKS_UPDATE']),
      task: {
        ...baseTask,
        createdById: actor.id,
        assignees: [{ userId: 'assignee-1', assignedAt: new Date(), user: {} }],
      },
      activeUsers: [{ id: 'assignee-1' }, { id: 'assignee-2' }],
      activeMembers: [{ userId: 'assignee-1' }, { userId: 'assignee-2' }],
    });
    await service.setAssignees(
      'proj-1',
      'task-1',
      { assigneeIds: ['assignee-1', 'assignee-2'] },
      actor,
    );
    expect(notifications.notifyTaskAssigned).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'assignee-1' }),
    );
    expect(notifications.notifyTaskAssigned).toHaveBeenCalledWith({
      userId: 'assignee-2',
      actorId: actor.id,
      projectId: 'proj-1',
      taskId: 'task-1',
    });
  });
});

const baseListQuery = {
  page: 1,
  pageSize: 25,
  includeCompleted: false,
  sort: 'dueDate' as const,
  order: 'asc' as const,
};

describe('TasksService.list', () => {
  it('excludes DONE tasks by default', async () => {
    const { service, prisma } = makeService();
    await service.list('proj-1', baseListQuery, actor);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'DONE' } }),
      }),
    );
  });

  it('includes DONE tasks when includeCompleted is true', async () => {
    const { service, prisma } = makeService();
    await service.list(
      'proj-1',
      { ...baseListQuery, includeCompleted: true },
      actor,
    );
    const call = (prisma.task.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where.status).toBeUndefined();
  });

  it('requires visibility of the project before listing', async () => {
    const { service, access } = makeService();
    await service.list('proj-1', baseListQuery, actor);
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });
});
