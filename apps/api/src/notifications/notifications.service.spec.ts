import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { Prisma } from '../generated/prisma/client.js';

const actor: AuthenticatedUser = {
  id: 'user-1',
  email: 'user@example.com',
  isOwner: false,
  sessionId: 's1',
};

function makeService(overrides?: {
  updateManyCount?: number;
  existingNotification?: unknown;
  createRejects?: Error;
}) {
  const prisma = {
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi
        .fn()
        .mockResolvedValue(overrides?.existingNotification ?? null),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides?.updateManyCount ?? 1 }),
      create: overrides?.createRejects
        ? vi.fn().mockRejectedValue(overrides.createRejects)
        : vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  return { service: new NotificationsService(prisma), prisma };
}

describe('NotificationsService.list', () => {
  it("scopes every query to the actor's own notifications", async () => {
    const { service, prisma } = makeService();
    await service.list(actor, { page: 1, pageSize: 25 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: actor.id }),
      }),
    );
  });

  it('filters by read=true as readAt not null', async () => {
    const { service, prisma } = makeService();
    await service.list(actor, { page: 1, pageSize: 25, read: true });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: { not: null } }),
      }),
    );
  });

  it('filters by read=false as readAt null', async () => {
    const { service, prisma } = makeService();
    await service.list(actor, { page: 1, pageSize: 25, read: false });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: null }),
      }),
    );
  });

  it('filters by type when provided', async () => {
    const { service, prisma } = makeService();
    await service.list(actor, { page: 1, pageSize: 25, type: 'TASK_ASSIGNED' });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'TASK_ASSIGNED' }),
      }),
    );
  });
});

describe('NotificationsService.unreadCount', () => {
  it("counts only the actor's own unread notifications", async () => {
    const { service, prisma } = makeService();
    await service.unreadCount(actor);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: actor.id, readAt: null },
    });
  });
});

describe('NotificationsService.markRead', () => {
  it('marks an unread notification as read', async () => {
    const { service, prisma } = makeService();
    await service.markRead(actor, 'notif-1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', userId: actor.id, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('is idempotent when the notification is already read', async () => {
    const { service } = makeService({
      updateManyCount: 0,
      existingNotification: { id: 'notif-1', readAt: new Date() },
    });
    await expect(service.markRead(actor, 'notif-1')).resolves.toBeUndefined();
  });

  it('404s on a nonexistent or not-owned notification, never revealing which', async () => {
    const { service } = makeService({
      updateManyCount: 0,
      existingNotification: null,
    });
    await expect(service.markRead(actor, 'notif-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('NotificationsService.markAllRead', () => {
  it("marks only the actor's own unread notifications", async () => {
    const { service, prisma } = makeService();
    await service.markAllRead(actor);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: actor.id, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe('NotificationsService notify* triggers', () => {
  it('creates a TASK_ASSIGNED notification without a dedupeKey', async () => {
    const { service, prisma } = makeService();
    await service.notifyTaskAssigned({
      userId: 'assignee-1',
      actorId: 'actor-1',
      projectId: 'proj-1',
      taskId: 'task-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'assignee-1',
        type: 'TASK_ASSIGNED',
        actorId: 'actor-1',
        projectId: 'proj-1',
        taskId: 'task-1',
      }),
    });
    const call = (prisma.notification.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.data.dedupeKey).toBeUndefined();
  });

  it('never notifies the actor about their own action', async () => {
    const { service, prisma } = makeService();
    await service.notifyTaskAssigned({
      userId: 'actor-1',
      actorId: 'actor-1',
      projectId: 'proj-1',
      taskId: 'task-1',
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates a MEETING_ADDED notification', async () => {
    const { service, prisma } = makeService();
    await service.notifyMeetingAdded({
      userId: 'participant-1',
      actorId: 'actor-1',
      projectId: 'proj-1',
      meetingId: 'meeting-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'MEETING_ADDED',
        meetingId: 'meeting-1',
        userId: 'participant-1',
      }),
    });
  });

  // Regression coverage for a Phase 11 Codex adversarial review finding: a
  // dedupeKey tied to a re-read timestamp could collide across two genuinely
  // distinct significant updates (or permanently suppress re-assignment
  // after removal), silently dropping a legitimate notification. Per
  // docs/DATABASE.md, dedupeKey exists for retryable events (reminders),
  // not these synchronous one-shot triggers — so none of them set one.
  it('creates a MEETING_UPDATED notification without a dedupeKey, so repeated significant updates each notify', async () => {
    const { service, prisma } = makeService();
    await service.notifyMeetingUpdated({
      userId: 'participant-1',
      actorId: 'actor-1',
      projectId: 'proj-1',
      meetingId: 'meeting-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'MEETING_UPDATED' }),
    });
    const call = (prisma.notification.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.data.dedupeKey).toBeUndefined();
  });

  it('swallows a dedupeKey unique-constraint violation instead of throwing (defensive, for future callers that do set one)', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      'duplicate',
      { code: 'P2002', clientVersion: 'test' },
    );
    const { service } = makeService({ createRejects: duplicateError });
    await expect(
      service.notifyTaskAssigned({
        userId: 'assignee-1',
        actorId: 'actor-1',
        projectId: 'proj-1',
        taskId: 'task-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows an unexpected error rather than propagating it to the caller', async () => {
    const { service } = makeService({ createRejects: new Error('db is down') });
    await expect(
      service.notifyTaskAssigned({
        userId: 'assignee-1',
        actorId: 'actor-1',
        projectId: 'proj-1',
        taskId: 'task-1',
      }),
    ).resolves.toBeUndefined();
  });
});
