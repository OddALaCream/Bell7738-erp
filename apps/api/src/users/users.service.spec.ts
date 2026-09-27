import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'target-1',
    email: 'target@example.com',
    firstName: 'Target',
    lastName: 'User',
    isOwner: false,
    status: 'ACTIVE',
    ...overrides,
  };
}

function makePrisma(overrides?: {
  target?: ReturnType<typeof makeUser> | null;
  updateManyCount?: number;
}) {
  const target =
    overrides?.target === undefined ? makeUser() : overrides.target;
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue(target),
      findUniqueOrThrow: vi.fn().mockResolvedValue(target),
      update: vi.fn().mockResolvedValue(target),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides?.updateManyCount ?? 1 }),
    },
    session: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    user: tx.user,
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  return { prisma, tx };
}

describe('UsersService.update (admin edit)', () => {
  it("rejects a non-owner actor editing the Owner's record", async () => {
    const { prisma } = makePrisma({
      target: makeUser({ id: 'owner-1', isOwner: true }),
    });
    const service = new UsersService(prisma);
    await expect(
      service.update('owner-1', { firstName: 'Hacked' }, 'someone-else'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the Owner to edit their own record', async () => {
    const { prisma } = makePrisma({
      target: makeUser({ id: 'owner-1', isOwner: true }),
    });
    const service = new UsersService(prisma);
    await expect(
      service.update('owner-1', { firstName: 'Self' }, 'owner-1'),
    ).resolves.toBeDefined();
  });

  it('allows a non-owner admin to edit a non-owner target', async () => {
    const { prisma } = makePrisma();
    const service = new UsersService(prisma);
    await expect(
      service.update('target-1', { firstName: 'New' }, 'admin-1'),
    ).resolves.toBeDefined();
  });
});

describe('UsersService status transitions', () => {
  it('rejects a user changing their own status (self-suspend)', async () => {
    const { prisma } = makePrisma();
    const service = new UsersService(prisma);
    await expect(
      service.suspend('target-1', 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects suspending an INVITED user (wrong fromStatus)', async () => {
    const { prisma } = makePrisma({
      updateManyCount: 0,
      target: makeUser({ status: 'INVITED' }),
    });
    const service = new UsersService(prisma);
    await expect(service.suspend('target-1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('suspends an ACTIVE user and revokes sessions', async () => {
    const { prisma, tx } = makePrisma({ updateManyCount: 1 });
    const service = new UsersService(prisma);
    await service.suspend('target-1', 'admin-1');
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'target-1', isOwner: false, status: { in: ['ACTIVE'] } },
      data: { status: 'SUSPENDED' },
    });
    expect(tx.session.updateMany).toHaveBeenCalled();
  });

  it('rejects suspending the Owner even when count is 0 for that reason', async () => {
    const { prisma } = makePrisma({
      updateManyCount: 0,
      target: makeUser({ isOwner: true }),
    });
    const service = new UsersService(prisma);
    await expect(service.suspend('target-1', 'admin-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s when the target does not exist and the update matched nothing', async () => {
    const { prisma } = makePrisma({ updateManyCount: 0, target: null });
    const service = new UsersService(prisma);
    await expect(service.suspend('missing', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('disable allows both ACTIVE and SUSPENDED sources', async () => {
    const { prisma, tx } = makePrisma({
      updateManyCount: 1,
      target: makeUser({ status: 'SUSPENDED' }),
    });
    const service = new UsersService(prisma);
    await service.disable('target-1', 'admin-1');
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'target-1',
        isOwner: false,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      data: { status: 'DISABLED' },
    });
  });

  it('reactivate rejects a non-SUSPENDED user', async () => {
    const { prisma } = makePrisma({
      updateManyCount: 0,
      target: makeUser({ status: 'ACTIVE' }),
    });
    const service = new UsersService(prisma);
    await expect(
      service.reactivate('target-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivate does not revoke sessions', async () => {
    const { prisma, tx } = makePrisma({
      updateManyCount: 1,
      target: makeUser({ status: 'SUSPENDED' }),
    });
    const service = new UsersService(prisma);
    await service.reactivate('target-1', 'admin-1');
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });
});
