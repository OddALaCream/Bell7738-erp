import { NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const listQuery = { page: 1, pageSize: 25 };

function makeService(overrides?: { entry?: unknown; createRejects?: Error }) {
  const prisma = {
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides?.entry !== undefined ? overrides.entry : { id: 'audit-1' },
        ),
      create: overrides?.createRejects
        ? vi.fn().mockRejectedValue(overrides.createRejects)
        : vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  } as unknown as PrismaService;

  return { service: new AuditService(prisma), prisma };
}

describe('AuditService.list', () => {
  it('filters by actorId, action, entityType and entityId when provided', async () => {
    const { service, prisma } = makeService();
    await service.list({
      ...listQuery,
      actorId: 'actor-1',
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: 'user-1',
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actorId: 'actor-1',
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: 'user-1',
        },
      }),
    );
  });
});

describe('AuditService.getById', () => {
  it('404s on a nonexistent entry', async () => {
    const { service } = makeService({ entry: null });
    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the entry when it exists', async () => {
    const { service } = makeService({ entry: { id: 'audit-1' } });
    await expect(service.getById('audit-1')).resolves.toEqual({
      id: 'audit-1',
    });
  });
});

describe('AuditService.log', () => {
  it('writes an AuditLog row with actor, action, entity and context fields', async () => {
    const { service, prisma } = makeService();
    await service.log({
      actorId: 'actor-1',
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: 'user-1',
      metadata: { fields: ['firstName'] },
      context: { requestId: 'req-1', ip: '127.0.0.1', userAgent: 'agent' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'actor-1',
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: 'user-1',
        requestId: 'req-1',
        ip: '127.0.0.1',
        userAgent: 'agent',
        metadata: { fields: ['firstName'] },
      },
    });
  });

  // Best-effort like ActivityService/NotificationsService: a logging failure
  // must never fail the primary operation it's attached to.
  it('swallows a write failure instead of throwing', async () => {
    const { service } = makeService({ createRejects: new Error('db down') });
    await expect(
      service.log({ actorId: 'actor-1', action: 'USER_UPDATED' }),
    ).resolves.toBeUndefined();
  });

  // Regression coverage for a Phase 12 Codex adversarial review finding: an
  // oversized User-Agent header must never be able to fail the write, since
  // the column is varchar(512).
  it('truncates an oversized userAgent to the column limit', async () => {
    const { service, prisma } = makeService();
    const oversized = 'a'.repeat(600);
    await service.log({
      actorId: 'actor-1',
      action: 'USER_UPDATED',
      context: { requestId: 'req-1', userAgent: oversized },
    });
    const data = (prisma.auditLog.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0].data;
    expect(data.userAgent).toHaveLength(512);
  });
});

describe('AuditService.logInTransaction', () => {
  it('writes an AuditLog row via the given transaction client', async () => {
    const { service } = makeService();
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'a-1' }) },
    };
    await service.logInTransaction(tx as never, {
      actorId: 'actor-1',
      action: 'USER_SUSPENDED',
      entityType: 'User',
      entityId: 'user-1',
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'actor-1',
          action: 'USER_SUSPENDED',
        }),
      }),
    );
  });

  // docs/ARCHITECTURE.md: a critical change and its durable audit event
  // commit atomically — unlike log(), a write failure here must propagate so
  // the caller's transaction rolls back instead of silently losing the
  // audit trail while the primary mutation still succeeds.
  it('propagates a write failure instead of swallowing it', async () => {
    const tx = {
      auditLog: {
        create: vi.fn().mockRejectedValue(new Error('db down')),
      },
    };
    const { service } = makeService();
    await expect(
      service.logInTransaction(tx as never, {
        actorId: 'actor-1',
        action: 'USER_SUSPENDED',
      }),
    ).rejects.toThrow('db down');
  });
});
