import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppConfigService } from '../config/app-config.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const owner: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  isOwner: true,
  sessionId: 's1',
};
const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  isOwner: false,
  sessionId: 's2',
};

function makeService(overrides?: {
  existingUser?: unknown;
  roles?: Array<{
    id: string;
    rolePermissions: Array<{ permission: { key: string } }>;
  }>;
  actorPermissions?: Set<string>;
}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(overrides?.existingUser ?? null),
    },
    role: { findMany: vi.fn().mockResolvedValue(overrides?.roles ?? []) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: vi.fn().mockResolvedValue({ id: 'new-user-1' }) },
        invitation: {
          create: vi.fn().mockResolvedValue({
            id: 'inv-1',
            userId: 'new-user-1',
            invitedById: 'admin-1',
            expiresAt: new Date(Date.now() + 1000),
            acceptedAt: null,
            revokedAt: null,
            createdAt: new Date(),
            user: {
              email: 'new@example.com',
              firstName: 'New',
              lastName: 'Hire',
              status: 'INVITED',
            },
          }),
        },
        invitationRole: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }),
    ),
  } as unknown as PrismaService;

  const config = {
    auth: { invitationTtlHours: 72 },
    app: { webOrigin: 'http://localhost:5173' },
  } as unknown as AppConfigService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(overrides?.actorPermissions ?? new Set()),
  } as unknown as EffectivePermissionsService;

  return {
    service: new InvitationsService(prisma, config, effectivePermissions),
    prisma,
    effectivePermissions,
  };
}

describe('InvitationsService.create — role anti-escalation', () => {
  const dto = {
    email: 'new@example.com',
    firstName: 'New',
    lastName: 'Hire',
    roleIds: ['role-1'],
  };

  it('rejects a nonexistent roleId with a validation error, not a raw FK failure', async () => {
    const { service } = makeService({ roles: [] });
    await expect(service.create(dto, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a non-owner granting a role whose permissions exceed the actor's own", async () => {
    const { service } = makeService({
      roles: [
        {
          id: 'role-1',
          rolePermissions: [{ permission: { key: 'USERS_DISABLE' } }],
        },
      ],
      actorPermissions: new Set(['USERS_CREATE']),
    });
    await expect(service.create(dto, admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a non-owner granting a role whose permissions are a subset of their own', async () => {
    const { service } = makeService({
      roles: [
        {
          id: 'role-1',
          rolePermissions: [{ permission: { key: 'USERS_CREATE' } }],
        },
      ],
      actorPermissions: new Set(['USERS_CREATE', 'USERS_VIEW']),
    });
    await expect(service.create(dto, admin)).resolves.toBeDefined();
  });

  it('lets the Owner grant any existing role regardless of their own effective permissions', async () => {
    const { service, effectivePermissions } = makeService({
      roles: [
        {
          id: 'role-1',
          rolePermissions: [{ permission: { key: 'USERS_DISABLE' } }],
        },
      ],
    });
    await expect(service.create(dto, owner)).resolves.toBeDefined();
    expect(
      effectivePermissions.getEffectivePermissionKeys,
    ).not.toHaveBeenCalled();
  });

  it('skips the role check entirely when roleIds is empty', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.create({ ...dto, roleIds: [] }, admin),
    ).resolves.toBeDefined();
    expect(prisma.role.findMany).not.toHaveBeenCalled();
  });

  it('rejects inviting an email that already belongs to a user', async () => {
    const { service } = makeService({ existingUser: { id: 'existing-1' } });
    await expect(
      service.create({ ...dto, roleIds: [] }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
