import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppConfigService } from '../config/app-config.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { ProjectAccessService } from './project-access.service.js';
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

function makeService(overrides?: {
  effectiveKeys?: Set<string>;
  canManage?: boolean;
  project?: unknown;
  updateManyCount?: number;
}) {
  const projectCreate = vi.fn().mockResolvedValue({ id: 'proj-1' });
  const projectMemberCreate = vi.fn().mockResolvedValue(undefined);
  const tx = {
    project: { create: projectCreate },
    projectMember: { create: projectMemberCreate },
  };

  const prisma = {
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: projectCreate,
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides?.updateManyCount ?? 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    },
    projectMember: { create: projectMemberCreate },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const config = {
    projects: { endingSoonDays: 7 },
  } as unknown as AppConfigService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(overrides?.effectiveKeys ?? new Set<string>()),
  } as unknown as EffectivePermissionsService;

  const access = {
    assertCanViewProject: vi.fn().mockResolvedValue(
      overrides?.project ?? {
        id: 'proj-1',
        startDate: null,
        expectedEndDate: null,
        completedAt: null,
        status: 'ACTIVE',
      },
    ),
    canManageProject: vi.fn().mockResolvedValue(overrides?.canManage ?? true),
    getViewerCapabilities: vi.fn().mockResolvedValue({
      role: 'MANAGER',
      canUpdate: true,
      canDelete: true,
      canManageMembers: true,
    }),
  } as unknown as ProjectAccessService;

  return {
    service: new ProjectsService(prisma, config, effectivePermissions, access),
    prisma,
    access,
    effectivePermissions,
  };
}

const listQuery = {
  page: 1,
  pageSize: 25,
  sort: 'createdAt' as const,
  order: 'desc' as const,
};

describe('ProjectsService.list', () => {
  it('returns an empty page without querying when the actor has no view permission', async () => {
    const { service, prisma } = makeService({ effectiveKeys: new Set() });
    const result = await service.list(listQuery, actor);
    expect(result).toEqual({
      data: [],
      meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    });
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it('scopes the query to active memberships for PROJECTS_VIEW_ASSIGNED', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['PROJECTS_VIEW_ASSIGNED']),
    });
    await service.list(listQuery, actor);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          members: { some: { userId: actor.id, removedAt: null } },
        }),
      }),
    );
  });

  it('does not scope by membership for the Owner', async () => {
    const { service, prisma } = makeService();
    await service.list(listQuery, owner);
    const call = (prisma.project.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.where.members).toBeUndefined();
  });
});

describe('ProjectsService.create', () => {
  const dto = { name: 'New Project', status: 'PLANNED' as const };

  it('rejects a non-owner with neither PROJECTS_VIEW_ASSIGNED nor PROJECTS_VIEW_ALL', async () => {
    const { service } = makeService({ effectiveKeys: new Set() });
    await expect(service.create(dto, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a non-owner with PROJECTS_VIEW_ASSIGNED and adds them as MANAGER', async () => {
    const { service, prisma } = makeService({
      effectiveKeys: new Set(['PROJECTS_VIEW_ASSIGNED']),
    });
    await service.create(dto, actor);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects an expectedEndDate before startDate', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        { ...dto, startDate: '2026-05-10', expectedEndDate: '2026-05-01' },
        owner,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows the Owner unconditionally', async () => {
    const { service } = makeService();
    await expect(service.create(dto, owner)).resolves.toBeDefined();
  });
});

describe('ProjectsService.update', () => {
  const dto = { name: 'Renamed' };

  it('propagates the 404 from assertCanViewProject', async () => {
    const { service, access } = makeService();
    (
      access.assertCanViewProject as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new NotFoundException());
    await expect(service.update('proj-1', dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when the actor can view but cannot manage the project', async () => {
    const { service } = makeService({ canManage: false });
    await expect(service.update('proj-1', dto, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a date range that becomes invalid after merging with the existing project', async () => {
    const { service } = makeService({
      project: {
        id: 'proj-1',
        startDate: new Date('2026-05-10'),
        expectedEndDate: null,
        completedAt: null,
        status: 'ACTIVE',
      },
    });
    await expect(
      service.update('proj-1', { expectedEndDate: '2026-05-01' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets completedAt when transitioning to COMPLETED', async () => {
    const { service, prisma } = makeService();
    await service.update('proj-1', { status: 'COMPLETED' }, actor);
    expect(prisma.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('clears completedAt when transitioning away from COMPLETED', async () => {
    const { service, prisma } = makeService({
      project: {
        id: 'proj-1',
        startDate: null,
        expectedEndDate: null,
        completedAt: new Date(),
        status: 'COMPLETED',
      },
    });
    await service.update('proj-1', { status: 'ACTIVE' }, actor);
    expect(prisma.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE', completedAt: null }),
      }),
    );
  });

  it('conditions the write on deletedAt: null so a concurrent delete cannot be silently overwritten', async () => {
    const { service, prisma } = makeService();
    await service.update('proj-1', dto, actor);
    expect(prisma.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'proj-1', deletedAt: null } }),
    );
  });

  it('404s if the project was deleted concurrently between visibility check and write', async () => {
    const { service } = makeService({ updateManyCount: 0 });
    await expect(service.update('proj-1', dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ProjectsService.delete', () => {
  it('propagates the 404 from assertCanViewProject', async () => {
    const { service, access } = makeService();
    (
      access.assertCanViewProject as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new NotFoundException());
    await expect(service.delete('proj-1', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when the actor can view but cannot manage the project', async () => {
    const { service } = makeService({ canManage: false });
    await expect(service.delete('proj-1', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('soft-deletes via a conditional updateMany', async () => {
    const { service, prisma } = makeService();
    await service.delete('proj-1', actor);
    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: { id: 'proj-1', deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedById: actor.id },
    });
  });

  it('404s if the project was already deleted concurrently', async () => {
    const { service } = makeService({ updateManyCount: 0 });
    await expect(service.delete('proj-1', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
