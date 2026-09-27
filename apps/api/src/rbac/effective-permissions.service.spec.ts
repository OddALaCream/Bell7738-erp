import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
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
  userRoles?: Array<{
    role: { rolePermissions: Array<{ permission: { key: string } }> };
  }>;
  roles?: Array<{ rolePermissions: Array<{ permission: { key: string } }> }>;
  permissions?: Array<{ key: string }>;
}) {
  const prisma = {
    userRole: {
      findMany: vi.fn().mockResolvedValue(overrides?.userRoles ?? []),
    },
    role: { findMany: vi.fn().mockResolvedValue(overrides?.roles ?? []) },
    permission: {
      findMany: vi.fn().mockResolvedValue(overrides?.permissions ?? []),
    },
  } as unknown as PrismaService;
  return new EffectivePermissionsService(prisma);
}

describe('EffectivePermissionsService.getEffectivePermissionKeys', () => {
  it("unions permissions across all of a user's roles", async () => {
    const service = makeService({
      userRoles: [
        {
          role: {
            rolePermissions: [
              { permission: { key: 'A' } },
              { permission: { key: 'B' } },
            ],
          },
        },
        {
          role: {
            rolePermissions: [
              { permission: { key: 'B' } },
              { permission: { key: 'C' } },
            ],
          },
        },
      ],
    });
    const keys = await service.getEffectivePermissionKeys('user-1');
    expect([...keys].sort()).toEqual(['A', 'B', 'C']);
  });

  it('returns an empty set for a user with no roles', async () => {
    const service = makeService();
    const keys = await service.getEffectivePermissionKeys('user-1');
    expect(keys.size).toBe(0);
  });
});

describe('EffectivePermissionsService.assertActorCanGrantPermissionKeys', () => {
  it('always allows the Owner without checking anything', async () => {
    const service = makeService();
    await expect(
      service.assertActorCanGrantPermissionKeys(['ANYTHING'], owner),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-owner granting a permission they lack', async () => {
    const service = makeService({
      userRoles: [
        { role: { rolePermissions: [{ permission: { key: 'USERS_VIEW' } }] } },
      ],
    });
    await expect(
      service.assertActorCanGrantPermissionKeys(['USERS_DISABLE'], admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a non-owner granting permissions they hold', async () => {
    const service = makeService({
      userRoles: [
        { role: { rolePermissions: [{ permission: { key: 'USERS_VIEW' } }] } },
      ],
    });
    await expect(
      service.assertActorCanGrantPermissionKeys(['USERS_VIEW'], admin),
    ).resolves.toBeUndefined();
  });
});

describe('EffectivePermissionsService.assertRolesExistAndActorCanGrant', () => {
  it('no-ops for an empty roleIds array', async () => {
    const service = makeService();
    await expect(
      service.assertRolesExistAndActorCanGrant([], admin),
    ).resolves.toBeUndefined();
  });

  it('rejects a nonexistent roleId', async () => {
    const service = makeService({ roles: [] });
    await expect(
      service.assertRolesExistAndActorCanGrant(['missing-role'], admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects granting a role whose permissions exceed the actor's own", async () => {
    const service = makeService({
      roles: [{ rolePermissions: [{ permission: { key: 'USERS_DISABLE' } }] }],
      userRoles: [
        {
          role: { rolePermissions: [{ permission: { key: 'USERS_CREATE' } }] },
        },
      ],
    });
    await expect(
      service.assertRolesExistAndActorCanGrant(['role-1'], admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows granting a role whose permissions are within the actor's own", async () => {
    const service = makeService({
      roles: [{ rolePermissions: [{ permission: { key: 'USERS_CREATE' } }] }],
      userRoles: [
        {
          role: { rolePermissions: [{ permission: { key: 'USERS_CREATE' } }] },
        },
      ],
    });
    await expect(
      service.assertRolesExistAndActorCanGrant(['role-1'], admin),
    ).resolves.toBeUndefined();
  });
});

describe('EffectivePermissionsService.assertPermissionsExistAndActorCanGrant', () => {
  it('no-ops for an empty permissionIds array', async () => {
    const service = makeService();
    await expect(
      service.assertPermissionsExistAndActorCanGrant([], admin),
    ).resolves.toBeUndefined();
  });

  it('rejects a nonexistent permissionId', async () => {
    const service = makeService({ permissions: [] });
    await expect(
      service.assertPermissionsExistAndActorCanGrant(
        ['missing-permission'],
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-owner granting a permission they do not hold', async () => {
    const service = makeService({
      permissions: [{ key: 'USERS_DISABLE' }],
      userRoles: [
        {
          role: { rolePermissions: [{ permission: { key: 'USERS_CREATE' } }] },
        },
      ],
    });
    await expect(
      service.assertPermissionsExistAndActorCanGrant(['perm-1'], admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a non-owner granting a permission they hold', async () => {
    const service = makeService({
      permissions: [{ key: 'USERS_CREATE' }],
      userRoles: [
        {
          role: { rolePermissions: [{ permission: { key: 'USERS_CREATE' } }] },
        },
      ],
    });
    await expect(
      service.assertPermissionsExistAndActorCanGrant(['perm-1'], admin),
    ).resolves.toBeUndefined();
  });

  it('always allows the Owner without checking anything', async () => {
    const service = makeService({ permissions: [{ key: 'ANYTHING' }] });
    await expect(
      service.assertPermissionsExistAndActorCanGrant(['perm-1'], owner),
    ).resolves.toBeUndefined();
  });
});
