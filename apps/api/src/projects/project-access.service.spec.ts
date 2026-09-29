import { NotFoundException } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const owner: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  isOwner: true,
  sessionId: 's1',
};
const member: AuthenticatedUser = {
  id: 'member-1',
  email: 'member@example.com',
  isOwner: false,
  sessionId: 's2',
};

function makeService(overrides?: {
  effectiveKeys?: Set<string>;
  membership?: { role: 'MANAGER' | 'MEMBER' | 'VIEWER' } | null;
  project?: unknown;
}) {
  const prisma = {
    projectMember: {
      findFirst: vi.fn().mockResolvedValue(overrides?.membership ?? null),
    },
    project: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides?.project !== undefined
            ? overrides.project
            : { id: 'proj-1', deletedAt: null },
        ),
    },
  } as unknown as PrismaService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(overrides?.effectiveKeys ?? new Set<string>()),
  } as unknown as EffectivePermissionsService;

  return {
    service: new ProjectAccessService(prisma, effectivePermissions),
    prisma,
  };
}

describe('ProjectAccessService.canViewProject', () => {
  it('always allows the Owner', async () => {
    const { service } = makeService();
    await expect(service.canViewProject(owner, 'proj-1')).resolves.toBe(true);
  });

  it('allows a non-owner with PROJECTS_VIEW_ALL regardless of membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_VIEW_ALL']),
    });
    await expect(service.canViewProject(member, 'proj-1')).resolves.toBe(true);
  });

  it('allows a non-owner with PROJECTS_VIEW_ASSIGNED and an active membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_VIEW_ASSIGNED']),
      membership: { role: 'MEMBER' },
    });
    await expect(service.canViewProject(member, 'proj-1')).resolves.toBe(true);
  });

  it('denies a non-owner with PROJECTS_VIEW_ASSIGNED but no active membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_VIEW_ASSIGNED']),
      membership: null,
    });
    await expect(service.canViewProject(member, 'proj-1')).resolves.toBe(false);
  });

  it('denies a non-owner with neither view permission', async () => {
    const { service } = makeService({ effectiveKeys: new Set() });
    await expect(service.canViewProject(member, 'proj-1')).resolves.toBe(false);
  });
});

describe('ProjectAccessService.assertCanViewProject', () => {
  it('404s on a nonexistent project', async () => {
    const { service } = makeService({ project: null });
    await expect(
      service.assertCanViewProject(owner, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s on a soft-deleted project', async () => {
    const { service } = makeService({
      project: { id: 'proj-1', deletedAt: new Date() },
    });
    await expect(
      service.assertCanViewProject(owner, 'proj-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s (never 403) when the project exists but the actor cannot see it — avoids confirming existence', async () => {
    const { service } = makeService({ effectiveKeys: new Set() });
    await expect(
      service.assertCanViewProject(member, 'proj-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the project when visible', async () => {
    const { service } = makeService();
    await expect(
      service.assertCanViewProject(owner, 'proj-1'),
    ).resolves.toMatchObject({ id: 'proj-1' });
  });
});

describe('ProjectAccessService.canManageProject', () => {
  it('always allows the Owner', async () => {
    const { service } = makeService();
    await expect(
      service.canManageProject(owner, 'proj-1', 'PROJECTS_UPDATE'),
    ).resolves.toBe(true);
  });

  it('denies a non-owner lacking the specific permission entirely', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.canManageProject(member, 'proj-1', 'PROJECTS_UPDATE'),
    ).resolves.toBe(false);
  });

  it('allows a non-owner with the permission and PROJECTS_VIEW_ALL override, without membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_UPDATE', 'PROJECTS_VIEW_ALL']),
      membership: null,
    });
    await expect(
      service.canManageProject(member, 'proj-1', 'PROJECTS_UPDATE'),
    ).resolves.toBe(true);
  });

  it('allows a non-owner with the permission and an active MANAGER membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_UPDATE']),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.canManageProject(member, 'proj-1', 'PROJECTS_UPDATE'),
    ).resolves.toBe(true);
  });

  it('denies a non-owner with the permission but only a MEMBER/VIEWER membership and no override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_UPDATE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.canManageProject(member, 'proj-1', 'PROJECTS_UPDATE'),
    ).resolves.toBe(false);
  });
});

describe('ProjectAccessService.hasMemberLevelAccess', () => {
  it('always allows the Owner', async () => {
    const { service } = makeService();
    await expect(
      service.hasMemberLevelAccess(owner, 'proj-1', 'TASKS_CREATE'),
    ).resolves.toBe(true);
  });

  it('denies a non-owner lacking the specific permission entirely', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.hasMemberLevelAccess(member, 'proj-1', 'TASKS_CREATE'),
    ).resolves.toBe(false);
  });

  it('allows a non-owner with the permission and PROJECTS_VIEW_ALL override, without membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_CREATE', 'PROJECTS_VIEW_ALL']),
      membership: null,
    });
    await expect(
      service.hasMemberLevelAccess(member, 'proj-1', 'TASKS_CREATE'),
    ).resolves.toBe(true);
  });

  it('allows a non-owner with the permission and a MEMBER membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_CREATE']),
      membership: { role: 'MEMBER' },
    });
    await expect(
      service.hasMemberLevelAccess(member, 'proj-1', 'TASKS_CREATE'),
    ).resolves.toBe(true);
  });

  it('allows a non-owner with the permission and a MANAGER membership', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_CREATE']),
      membership: { role: 'MANAGER' },
    });
    await expect(
      service.hasMemberLevelAccess(member, 'proj-1', 'TASKS_CREATE'),
    ).resolves.toBe(true);
  });

  it('denies a non-owner with the permission but only a VIEWER membership and no override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_CREATE']),
      membership: { role: 'VIEWER' },
    });
    await expect(
      service.hasMemberLevelAccess(member, 'proj-1', 'TASKS_CREATE'),
    ).resolves.toBe(false);
  });

  it('denies a non-owner with the permission but no membership and no override', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['TASKS_CREATE']),
      membership: null,
    });
    await expect(
      service.hasMemberLevelAccess(member, 'proj-1', 'TASKS_CREATE'),
    ).resolves.toBe(false);
  });
});

describe('ProjectAccessService.buildProjectScope', () => {
  it('is unrestricted for the Owner', async () => {
    const { service } = makeService();
    await expect(service.buildProjectScope(owner)).resolves.toEqual({});
  });

  it('is unrestricted for PROJECTS_VIEW_ALL', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_VIEW_ALL']),
    });
    await expect(service.buildProjectScope(member)).resolves.toEqual({});
  });

  it('limits PROJECTS_VIEW_ASSIGNED to the actor’s active memberships', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_VIEW_ASSIGNED']),
    });
    await expect(service.buildProjectScope(member)).resolves.toEqual({
      members: { some: { userId: 'member-1', removedAt: null } },
    });
  });

  it('is null (sees nothing) without any project view permission', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['PROJECTS_CREATE', 'TASKS_CREATE']),
    });
    await expect(service.buildProjectScope(member)).resolves.toBeNull();
  });
});
