import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ProjectAccessService } from '../projects/project-access.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const audit = {
  log: vi.fn().mockResolvedValue(undefined),
  logInTransaction: vi.fn().mockResolvedValue(undefined),
} as unknown as AuditService;

const access = {
  buildProjectScope: vi.fn().mockResolvedValue({}),
} as unknown as ProjectAccessService;

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'target-1',
    email: 'target@example.com',
    firstName: 'Target',
    lastName: 'User',
    isOwner: false,
    status: 'ACTIVE',
    userRoles: [],
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
  it('denies self-suspension through an uppercase spelling of the UUID', async () => {
    const id = 'aabbccdd-0000-4000-8000-000000000001';
    const { prisma } = makePrisma({ target: makeUser({ id }) });
    const service = new UsersService(prisma, audit, access);
    await expect(service.suspend(id.toUpperCase(), id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects a non-owner actor editing the Owner's record", async () => {
    const { prisma } = makePrisma({
      target: makeUser({ id: 'owner-1', isOwner: true }),
    });
    const service = new UsersService(prisma, audit, access);
    await expect(
      service.update('owner-1', { firstName: 'Hacked' }, 'someone-else'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the Owner to edit their own record', async () => {
    const { prisma } = makePrisma({
      target: makeUser({ id: 'owner-1', isOwner: true }),
    });
    const service = new UsersService(prisma, audit, access);
    await expect(
      service.update('owner-1', { firstName: 'Self' }, 'owner-1'),
    ).resolves.toBeDefined();
  });

  it('allows a non-owner admin to edit a non-owner target', async () => {
    const { prisma } = makePrisma();
    const service = new UsersService(prisma, audit, access);
    await expect(
      service.update('target-1', { firstName: 'New' }, 'admin-1'),
    ).resolves.toBeDefined();
  });
});

describe('UsersService status transitions', () => {
  it('rejects a user changing their own status (self-suspend)', async () => {
    const { prisma } = makePrisma();
    const service = new UsersService(prisma, audit, access);
    await expect(
      service.suspend('target-1', 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects suspending an INVITED user (wrong fromStatus)', async () => {
    const { prisma } = makePrisma({
      updateManyCount: 0,
      target: makeUser({ status: 'INVITED' }),
    });
    const service = new UsersService(prisma, audit, access);
    await expect(service.suspend('target-1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('suspends an ACTIVE user and revokes sessions', async () => {
    const { prisma, tx } = makePrisma({ updateManyCount: 1 });
    const service = new UsersService(prisma, audit, access);
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
    const service = new UsersService(prisma, audit, access);
    await expect(service.suspend('target-1', 'admin-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s when the target does not exist and the update matched nothing', async () => {
    const { prisma } = makePrisma({ updateManyCount: 0, target: null });
    const service = new UsersService(prisma, audit, access);
    await expect(service.suspend('missing', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('disable allows both ACTIVE and SUSPENDED sources', async () => {
    const { prisma, tx } = makePrisma({
      updateManyCount: 1,
      target: makeUser({ status: 'SUSPENDED' }),
    });
    const service = new UsersService(prisma, audit, access);
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
    const service = new UsersService(prisma, audit, access);
    await expect(
      service.reactivate('target-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivate does not revoke sessions', async () => {
    const { prisma, tx } = makePrisma({
      updateManyCount: 1,
      target: makeUser({ status: 'SUSPENDED' }),
    });
    const service = new UsersService(prisma, audit, access);
    await service.reactivate('target-1', 'admin-1');
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  // Regression coverage for a Phase 12 Codex adversarial review finding:
  // docs/ARCHITECTURE.md requires a critical change and its durable audit
  // event to commit in the same transaction — a failed audit write must
  // roll back the status change, not be swallowed after the fact.
  it('propagates an audit write failure from inside the same transaction', async () => {
    const { prisma } = makePrisma({ updateManyCount: 1 });
    const failingAudit = {
      log: vi.fn().mockResolvedValue(undefined),
      logInTransaction: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as AuditService;
    const service = new UsersService(prisma, failingAudit, access);
    await expect(service.suspend('target-1', 'admin-1')).rejects.toThrow(
      'db down',
    );
  });
});

describe('UsersService roles in responses', () => {
  it('exposes role summaries sorted by position instead of join rows', async () => {
    const { prisma } = makePrisma({
      target: makeUser({
        userRoles: [
          { role: { id: 'r2', name: 'Zed', color: '#222222', position: 2 } },
          { role: { id: 'r1', name: 'Alpha', color: '#111111', position: 1 } },
        ],
      }),
    });
    const service = new UsersService(prisma, audit, access);
    const user = await service.getById('target-1');
    expect(user).not.toHaveProperty('userRoles');
    expect(user.roles.map((role) => role.id)).toEqual(['r1', 'r2']);
  });
});

describe('UsersService profiles', () => {
  const observer: AuthenticatedUser = {
    id: 'observer-1',
    email: 'o@example.com',
    isOwner: false,
    sessionId: 's1',
  };

  function makeProfileService(options: {
    scope: Record<string, unknown> | null;
    memberships?: unknown[];
    active?: unknown[];
    done?: unknown[];
    target?: ReturnType<typeof makeUser> | null;
  }) {
    const profilePrisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            options.target === undefined ? makeUser() : options.target,
          ),
      },
      projectMember: {
        findMany: vi.fn().mockResolvedValue(options.memberships ?? []),
      },
      task: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(options.active ?? [])
          .mockResolvedValueOnce(options.done ?? []),
      },
    } as unknown as PrismaService;
    const scopedAccess = {
      buildProjectScope: vi.fn().mockResolvedValue(options.scope),
    } as unknown as ProjectAccessService;
    return {
      service: new UsersService(profilePrisma, audit, scopedAccess),
      prisma: profilePrisma,
      scopedAccess,
    };
  }

  const project = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    name: 'Alpha',
    status: 'ACTIVE',
    startDate: new Date('2026-01-05T00:00:00Z'),
    expectedEndDate: null,
    ...overrides,
  });

  it('returns nothing about projects or tasks when the observer sees no project', async () => {
    const { service, prisma } = makeProfileService({ scope: null });
    const profile = await service.getPublicProfile('target-1', observer);
    expect(profile).toMatchObject({
      activeProjects: [],
      pastProjects: [],
      activeTasks: [],
      completedTasks: [],
    });
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it("applies the observer's scope inside every query, never in memory", async () => {
    const scope = {
      members: { some: { userId: 'observer-1', removedAt: null } },
    };
    const { service, prisma } = makeProfileService({ scope });
    await service.getPublicProfile('target-1', observer);
    const expectedProject = { deletedAt: null, ...scope };
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'target-1', project: expectedProject },
      }),
    );
    for (const call of vi.mocked(prisma.task.findMany).mock.calls) {
      expect(call[0]?.where).toMatchObject({
        deletedAt: null,
        project: expectedProject,
        assignees: { some: { userId: 'target-1' } },
      });
    }
  });

  it('splits memberships into active and past projects and formats dates', async () => {
    const { service } = makeProfileService({
      scope: {},
      memberships: [
        { role: 'MANAGER', removedAt: null, project: project() },
        {
          role: 'MEMBER',
          removedAt: null,
          project: project({ id: 'p2', name: 'Done', status: 'COMPLETED' }),
        },
        {
          role: 'MEMBER',
          removedAt: new Date(),
          project: project({ id: 'p3', name: 'Left' }),
        },
      ],
    });
    const profile = await service.getPublicProfile('target-1', observer);
    expect(profile.activeProjects).toEqual([
      {
        id: 'p1',
        name: 'Alpha',
        status: 'ACTIVE',
        role: 'MANAGER',
        startDate: '2026-01-05',
        expectedEndDate: null,
      },
    ]);
    expect(profile.pastProjects.map((item) => item.id)).toEqual(['p2', 'p3']);
  });

  it('returns active and completed tasks with their project name', async () => {
    const task = {
      id: 't1',
      projectId: 'p1',
      title: 'Ship',
      startDate: new Date('2026-02-01T00:00:00Z'),
      dueDate: new Date('2026-02-03T00:00:00Z'),
      status: 'IN_PROGRESS',
      completedAt: null,
      project: { name: 'Alpha' },
    };
    const doneTask = {
      ...task,
      id: 't2',
      status: 'DONE',
      completedAt: new Date('2026-02-02T10:00:00Z'),
    };
    const { service } = makeProfileService({
      scope: {},
      active: [task],
      done: [doneTask],
    });
    const profile = await service.getOwnProfile(observer);
    expect(profile.activeTasks).toEqual([
      expect.objectContaining({
        id: 't1',
        projectName: 'Alpha',
        startDate: '2026-02-01',
        dueDate: '2026-02-03',
      }),
    ]);
    expect(profile.completedTasks[0]).toMatchObject({
      id: 't2',
      status: 'DONE',
    });
  });

  it('404s for a non-ACTIVE target before reading any project data', async () => {
    const { service, scopedAccess } = makeProfileService({
      scope: {},
      target: makeUser({ status: 'SUSPENDED' }),
    });
    await expect(
      service.getPublicProfile('target-1', observer),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(scopedAccess.buildProjectScope).not.toHaveBeenCalled();
  });

  it("never exposes admin fields on another person's profile", async () => {
    const { service } = makeProfileService({
      scope: {},
      target: makeUser({ lastLoginAt: new Date(), isOwner: true }),
    });
    const profile = await service.getPublicProfile('target-1', observer);
    expect(profile).not.toHaveProperty('status');
    expect(profile).not.toHaveProperty('isOwner');
    expect(profile).not.toHaveProperty('lastLoginAt');
    expect(profile).not.toHaveProperty('userRoles');
  });
});
