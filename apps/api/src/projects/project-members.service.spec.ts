import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectMembersService } from './project-members.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAccessService } from './project-access.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const actor: AuthenticatedUser = {
  id: 'actor-1',
  email: 'actor@example.com',
  isOwner: false,
  sessionId: 's1',
};

function makeService(overrides?: {
  canManage?: boolean;
  targetUser?: unknown;
  existingMembership?: unknown;
  activeMembership?: unknown;
  otherActiveManagers?: number;
  projectDeleted?: boolean;
}) {
  const otherActiveManagers = Array.from(
    { length: overrides?.otherActiveManagers ?? 1 },
    (_, i) => ({
      userId: `other-manager-${i}`,
    }),
  );

  const tx = {
    project: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          deletedAt: overrides?.projectDeleted ? new Date() : null,
        }),
    },
    projectMember: {
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides?.existingMembership ?? null),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides?.activeMembership !== undefined
            ? overrides.activeMembership
            : { role: 'MEMBER' },
        ),
      update: vi.fn().mockResolvedValue({ userId: 'target-1', role: 'MEMBER' }),
      create: vi.fn().mockResolvedValue({ userId: 'target-1', role: 'MEMBER' }),
    },
    // Tagged-template mock: `tx.$queryRaw\`...\`` calls this with (strings, ...values).
    $queryRaw: vi.fn().mockResolvedValue(otherActiveManagers),
  };

  const prisma = {
    projectMember: { findMany: vi.fn().mockResolvedValue([]) },
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides?.targetUser !== undefined
            ? overrides.targetUser
            : { id: 'target-1', status: 'ACTIVE' },
        ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const access = {
    assertCanViewProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    canManageProject: vi.fn().mockResolvedValue(overrides?.canManage ?? true),
  } as unknown as ProjectAccessService;

  return {
    service: new ProjectMembersService(prisma, access),
    prisma,
    access,
    tx,
  };
}

describe('ProjectMembersService.list', () => {
  it('requires visibility before listing', async () => {
    const { service, access } = makeService();
    await service.list('proj-1', actor);
    expect(access.assertCanViewProject).toHaveBeenCalledWith(actor, 'proj-1');
  });
});

describe('ProjectMembersService.add', () => {
  const dto = { userId: 'target-1', role: 'MEMBER' as const };

  it('rejects when the actor cannot manage members', async () => {
    const { service } = makeService({ canManage: false });
    await expect(service.add('proj-1', dto, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a target user who is not ACTIVE', async () => {
    const { service } = makeService({
      targetUser: { id: 'target-1', status: 'SUSPENDED' },
    });
    await expect(service.add('proj-1', dto, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a nonexistent target user', async () => {
    const { service } = makeService({ targetUser: null });
    await expect(service.add('proj-1', dto, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects adding a user who already has an active membership', async () => {
    const { service } = makeService({
      existingMembership: { removedAt: null },
    });
    await expect(service.add('proj-1', dto, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a new membership row when none exists', async () => {
    const { service, tx } = makeService({ existingMembership: null });
    await service.add('proj-1', dto, actor);
    expect(tx.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'proj-1',
          userId: 'target-1',
          role: 'MEMBER',
        }),
      }),
    );
  });

  it('rejoins via UPDATE (not INSERT) when a removed membership row already exists', async () => {
    const { service, tx } = makeService({
      existingMembership: { removedAt: new Date('2025-01-01') },
    });
    await service.add('proj-1', dto, actor);
    expect(tx.projectMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ removedAt: null, role: 'MEMBER' }),
      }),
    );
    expect(tx.projectMember.create).not.toHaveBeenCalled();
  });

  it('404s if the project was soft-deleted concurrently', async () => {
    const { service } = makeService({ projectDeleted: true });
    await expect(service.add('proj-1', dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ProjectMembersService.updateRole', () => {
  it('rejects when the actor cannot manage members', async () => {
    const { service } = makeService({ canManage: false });
    await expect(
      service.updateRole('proj-1', 'target-1', { role: 'VIEWER' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the target has no active membership', async () => {
    const { service } = makeService({ activeMembership: null });
    await expect(
      service.updateRole('proj-1', 'target-1', { role: 'VIEWER' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects demoting the last active manager', async () => {
    const { service } = makeService({
      activeMembership: { role: 'MANAGER' },
      otherActiveManagers: 0,
    });
    await expect(
      service.updateRole('proj-1', 'target-1', { role: 'MEMBER' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows demoting a manager when another active manager remains', async () => {
    const { service } = makeService({
      activeMembership: { role: 'MANAGER' },
      otherActiveManagers: 1,
    });
    await expect(
      service.updateRole('proj-1', 'target-1', { role: 'MEMBER' }, actor),
    ).resolves.toBeDefined();
  });

  it('does not check the last-manager invariant when the new role is still MANAGER', async () => {
    const { service, tx } = makeService({
      activeMembership: { role: 'MANAGER' },
      otherActiveManagers: 0,
    });
    await service.updateRole('proj-1', 'target-1', { role: 'MANAGER' }, actor);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('404s if the project was soft-deleted concurrently', async () => {
    const { service } = makeService({ projectDeleted: true });
    await expect(
      service.updateRole('proj-1', 'target-1', { role: 'VIEWER' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProjectMembersService.remove', () => {
  it('rejects when the actor cannot manage members', async () => {
    const { service } = makeService({ canManage: false });
    await expect(
      service.remove('proj-1', 'target-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the target has no active membership', async () => {
    const { service } = makeService({ activeMembership: null });
    await expect(
      service.remove('proj-1', 'target-1', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects removing the last active manager', async () => {
    const { service } = makeService({
      activeMembership: { role: 'MANAGER' },
      otherActiveManagers: 0,
    });
    await expect(
      service.remove('proj-1', 'target-1', actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-removes a non-last manager or a regular member', async () => {
    const { service, tx } = makeService({
      activeMembership: { role: 'MEMBER' },
    });
    await service.remove('proj-1', 'target-1', actor);
    expect(tx.projectMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { removedAt: expect.any(Date) } }),
    );
  });

  it('404s if the project was soft-deleted concurrently', async () => {
    const { service } = makeService({ projectDeleted: true });
    await expect(
      service.remove('proj-1', 'target-1', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
