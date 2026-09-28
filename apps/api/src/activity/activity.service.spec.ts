import { NotFoundException } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAccessService } from '../projects/project-access.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const actor: AuthenticatedUser = {
  id: 'actor-1',
  email: 'actor@example.com',
  isOwner: false,
  sessionId: 's1',
};

const listQuery = { page: 1, pageSize: 25 };

function makeService(overrides?: { canView?: boolean; createRejects?: Error }) {
  const prisma = {
    activityEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: overrides?.createRejects
        ? vi.fn().mockRejectedValue(overrides.createRejects)
        : vi.fn().mockResolvedValue({ id: 'event-1' }),
    },
  } as unknown as PrismaService;

  const access = {
    assertCanViewProject:
      overrides?.canView === false
        ? vi.fn().mockRejectedValue(new NotFoundException())
        : vi.fn().mockResolvedValue({ id: 'proj-1' }),
  } as unknown as ProjectAccessService;

  return { service: new ActivityService(prisma, access), prisma, access };
}

describe('ActivityService.list', () => {
  it('requires visibility of the project before listing', async () => {
    const { service, access } = makeService();
    await service.list('proj-1', listQuery, actor);
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });

  it('propagates the 404 from assertCanViewProject', async () => {
    const { service } = makeService({ canView: false });
    await expect(
      service.list('proj-1', listQuery, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters by type and actorId when provided', async () => {
    const { service, prisma } = makeService();
    await service.list(
      'proj-1',
      { ...listQuery, type: 'TASK_CREATED', actorId: 'actor-2' },
      actor,
    );
    expect(prisma.activityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: 'proj-1',
          type: 'TASK_CREATED',
          actorId: 'actor-2',
        }),
      }),
    );
  });
});

describe('ActivityService.record', () => {
  it('writes an ActivityEvent row with the given fields', async () => {
    const { service, prisma } = makeService();
    await service.record({
      projectId: 'proj-1',
      actorId: 'actor-1',
      type: 'TASK_CREATED',
      entityType: 'Task',
      entityId: 'task-1',
      metadata: { fields: ['title'] },
    });
    expect(prisma.activityEvent.create).toHaveBeenCalledWith({
      data: {
        projectId: 'proj-1',
        actorId: 'actor-1',
        type: 'TASK_CREATED',
        entityType: 'Task',
        entityId: 'task-1',
        metadata: { fields: ['title'] },
      },
    });
  });

  // Best-effort per docs/DATABASE.md: a logging failure must never fail or
  // roll back the primary operation it's attached to.
  it('swallows a write failure instead of throwing', async () => {
    const { service } = makeService({ createRejects: new Error('db down') });
    await expect(
      service.record({
        projectId: 'proj-1',
        actorId: 'actor-1',
        type: 'TASK_CREATED',
        entityType: 'Task',
      }),
    ).resolves.toBeUndefined();
  });
});
