import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EffectivePermissionsService } from './effective-permissions.service.js';
import type { AuditService } from '../audit/audit.service.js';
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

const roleRow = {
  id: 'role-1',
  name: 'Engineer',
  description: null,
  color: '#336699',
  position: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  rolePermissions: [
    {
      permission: {
        id: 'perm-1',
        key: 'USERS_VIEW',
        description: 'View users',
      },
    },
  ],
};

function makeService(overrides?: {
  effectiveKeys?: Set<string>;
  assertPermissionsRejects?: Error;
  assertRolesRejects?: Error;
  assertKeysRejects?: Error;
  existingRole?: unknown;
  findFirstRole?: unknown;
  targetUser?: unknown;
  userRoleCount?: number;
  invitationRoleCount?: number;
  roleFindManyResult?: unknown[];
  userRoleFindManyResult?: unknown[];
  permissionFindManyResult?: unknown[];
}) {
  const tx = {
    role: {
      create: vi.fn().mockResolvedValue({ id: 'role-1' }),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      findUniqueOrThrow: vi.fn().mockResolvedValue(roleRow),
    },
    rolePermission: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userRole: {
      count: vi.fn().mockResolvedValue(overrides?.userRoleCount ?? 0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    invitationRole: {
      count: vi.fn().mockResolvedValue(overrides?.invitationRoleCount ?? 0),
    },
  };

  const prisma = {
    permission: {
      findMany: vi
        .fn()
        .mockResolvedValue(overrides?.permissionFindManyResult ?? []),
    },
    role: {
      findMany: vi
        .fn()
        .mockResolvedValue(overrides?.roleFindManyResult ?? [roleRow]),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides?.existingRole !== undefined
            ? overrides.existingRole
            : roleRow,
        ),
      findFirst: vi.fn().mockResolvedValue(overrides?.findFirstRole ?? null),
    },
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides?.targetUser !== undefined
            ? overrides.targetUser
            : { id: 'user-1', isOwner: false },
        ),
    },
    userRole: {
      findMany: vi
        .fn()
        .mockResolvedValue(overrides?.userRoleFindManyResult ?? []),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const effectivePermissions = {
    getEffectivePermissionKeys: vi
      .fn()
      .mockResolvedValue(overrides?.effectiveKeys ?? new Set<string>()),
    assertPermissionsExistAndActorCanGrant: overrides?.assertPermissionsRejects
      ? vi.fn().mockRejectedValue(overrides.assertPermissionsRejects)
      : vi.fn().mockResolvedValue(undefined),
    assertRolesExistAndActorCanGrant: overrides?.assertRolesRejects
      ? vi.fn().mockRejectedValue(overrides.assertRolesRejects)
      : vi.fn().mockResolvedValue(undefined),
    assertActorCanGrantPermissionKeys: overrides?.assertKeysRejects
      ? vi.fn().mockRejectedValue(overrides.assertKeysRejects)
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as EffectivePermissionsService;

  const audit = {
    log: vi.fn().mockResolvedValue(undefined),
    logInTransaction: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  return {
    service: new RolesService(prisma, effectivePermissions, audit),
    prisma,
    effectivePermissions,
    audit,
    tx,
  };
}

describe('RolesService.listPermissions', () => {
  it('allows the Owner unconditionally', async () => {
    const { service } = makeService();
    await expect(service.listPermissions(owner)).resolves.toBeDefined();
  });

  it('allows a non-owner holding ROLES_VIEW', async () => {
    const { service } = makeService({ effectiveKeys: new Set(['ROLES_VIEW']) });
    await expect(service.listPermissions(admin)).resolves.toBeDefined();
  });

  it('allows a non-owner holding ROLES_MANAGE', async () => {
    const { service } = makeService({
      effectiveKeys: new Set(['ROLES_MANAGE']),
    });
    await expect(service.listPermissions(admin)).resolves.toBeDefined();
  });

  it('rejects a non-owner holding neither', async () => {
    const { service } = makeService({ effectiveKeys: new Set(['USERS_VIEW']) });
    await expect(service.listPermissions(admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('RolesService.listRoles', () => {
  it('returns full detail (with permissions) for the Owner', async () => {
    const { service } = makeService();
    const result = await service.listRoles(owner);
    expect(result[0]).toHaveProperty('permissions');
  });

  it('returns full detail for a non-owner holding ROLES_VIEW', async () => {
    const { service } = makeService({ effectiveKeys: new Set(['ROLES_VIEW']) });
    const result = await service.listRoles(admin);
    expect(result[0]).toHaveProperty('permissions');
  });

  it('returns only badge summaries for a non-owner without ROLES_VIEW', async () => {
    const { service } = makeService({ effectiveKeys: new Set() });
    const result = await service.listRoles(admin);
    expect(result[0]).not.toHaveProperty('permissions');
    expect(result[0]).toHaveProperty('color');
  });
});

describe('RolesService.create', () => {
  const dto = {
    name: 'Engineer',
    color: '#336699',
    position: 1,
    permissionIds: ['perm-1'],
  };

  it('rejects a duplicate name (case-insensitive)', async () => {
    const { service } = makeService({ findFirstRole: { id: 'other-role' } });
    await expect(service.create(dto, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('delegates anti-escalation to EffectivePermissionsService before creating anything', async () => {
    const { service, effectivePermissions, prisma } = makeService();
    await service.create(dto, admin);
    expect(
      effectivePermissions.assertPermissionsExistAndActorCanGrant,
    ).toHaveBeenCalledWith(['perm-1'], admin);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('propagates a rejection from the anti-escalation check without creating the role', async () => {
    const rejection = new ForbiddenException('nope');
    const { service, prisma } = makeService({
      assertPermissionsRejects: rejection,
    });
    await expect(service.create(dto, admin)).rejects.toBe(rejection);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows the Owner to grant any permission', async () => {
    const { service } = makeService();
    await expect(service.create(dto, owner)).resolves.toBeDefined();
  });
});

describe('RolesService.update', () => {
  const dto = { permissionIds: ['perm-1'] };

  it('404s on a missing role', async () => {
    const { service } = makeService({ existingRole: null });
    await expect(service.update('missing', dto, admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("validates the new full permission set against the actor's effective permissions", async () => {
    const { service, effectivePermissions } = makeService();
    await service.update('role-1', dto, admin);
    expect(
      effectivePermissions.assertPermissionsExistAndActorCanGrant,
    ).toHaveBeenCalledWith(['perm-1'], admin);
  });

  it('propagates an anti-escalation rejection without updating', async () => {
    const rejection = new ForbiddenException('nope');
    const { service, prisma } = makeService({
      assertPermissionsRejects: rejection,
    });
    await expect(service.update('role-1', dto, admin)).rejects.toBe(rejection);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips the name-uniqueness check when the name is unchanged (case-insensitive)', async () => {
    const { service, prisma } = makeService();
    await service.update('role-1', { name: 'engineer' }, admin);
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  // Regression coverage for a real finding from the Phase 6 Codex adversarial
  // review: validating only the new set let an actor strip a permission
  // they don't hold (e.g. AUDIT_VIEW) from a role via a smaller replacement.
  it('rejects removing a permission the actor does not hold, even though the new set is otherwise valid', async () => {
    const rejection = new ForbiddenException('cannot revoke');
    const { service, effectivePermissions, prisma } = makeService({
      existingRole: {
        name: 'Auditor',
        rolePermissions: [
          { permission: { key: 'AUDIT_VIEW' } },
          { permission: { key: 'USERS_VIEW' } },
        ],
      },
      permissionFindManyResult: [{ key: 'USERS_VIEW' }],
      assertKeysRejects: rejection,
    });
    await expect(
      service.update('role-1', { permissionIds: ['perm-1'] }, admin),
    ).rejects.toBe(rejection);
    expect(
      effectivePermissions.assertActorCanGrantPermissionKeys,
    ).toHaveBeenCalledWith(['AUDIT_VIEW'], admin);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows removing a permission the actor does hold', async () => {
    const { service } = makeService({
      existingRole: {
        name: 'Auditor',
        rolePermissions: [{ permission: { key: 'USERS_VIEW' } }],
      },
      permissionFindManyResult: [],
    });
    await expect(
      service.update('role-1', { permissionIds: [] }, admin),
    ).resolves.toBeDefined();
  });
});

describe('RolesService.delete', () => {
  it('404s on a missing role', async () => {
    const { service } = makeService({ existingRole: null });
    await expect(service.delete('missing', admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects deleting a role still assigned to a user', async () => {
    const { service } = makeService({ userRoleCount: 1 });
    await expect(service.delete('role-1', admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects deleting a role still referenced by a pending invitation', async () => {
    const { service } = makeService({ invitationRoleCount: 1 });
    await expect(service.delete('role-1', admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes an unassigned role', async () => {
    const { service, tx } = makeService();
    await service.delete('role-1', admin);
    expect(tx.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1' },
    });
    expect(tx.role.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
  });
});

describe('RolesService.assignRolesToUser', () => {
  it('rejects a non-owner assigning roles to themselves', async () => {
    const { service } = makeService();
    await expect(
      service.assignRolesToUser(admin.id, ['role-1'], admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Regression coverage: ParseUUIDPipe preserves caller-supplied casing, so
  // the self-assignment guard must not be a case-sensitive string compare.
  it('rejects self-assignment even when the userId differs only in UUID casing', async () => {
    const { service } = makeService();
    await expect(
      service.assignRolesToUser(admin.id.toUpperCase(), ['role-1'], admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s on a nonexistent target user', async () => {
    const { service } = makeService({ targetUser: null });
    await expect(
      service.assignRolesToUser('missing', ['role-1'], admin),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects targeting the Owner', async () => {
    const { service } = makeService({
      targetUser: { id: 'owner-1', isOwner: true },
    });
    await expect(
      service.assignRolesToUser('owner-1', ['role-1'], admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delegates anti-escalation to EffectivePermissionsService then replaces the role set', async () => {
    const { service, effectivePermissions, tx } = makeService();
    await service.assignRolesToUser('user-1', ['role-1'], admin);
    expect(
      effectivePermissions.assertRolesExistAndActorCanGrant,
    ).toHaveBeenCalledWith(['role-1'], admin);
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', roleId: 'role-1', assignedById: admin.id }],
    });
  });

  it('propagates an anti-escalation rejection without touching role assignments', async () => {
    const rejection = new ForbiddenException('nope');
    const { service, prisma } = makeService({ assertRolesRejects: rejection });
    await expect(
      service.assignRolesToUser('user-1', ['role-1'], admin),
    ).rejects.toBe(rejection);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // Regression coverage for a real finding from the Phase 6 Codex adversarial
  // review: validating only the new set let an actor strip a role carrying
  // a permission they don't hold (e.g. AUDIT_VIEW) from the target simply by
  // omitting it from the replacement set.
  it('rejects removing a role whose permissions the actor does not hold, even for an empty new set', async () => {
    const rejection = new ForbiddenException('cannot revoke');
    const { service, effectivePermissions, prisma } = makeService({
      userRoleFindManyResult: [
        { role: { rolePermissions: [{ permission: { key: 'AUDIT_VIEW' } }] } },
      ],
      roleFindManyResult: [],
      assertKeysRejects: rejection,
    });
    await expect(service.assignRolesToUser('user-1', [], admin)).rejects.toBe(
      rejection,
    );
    expect(
      effectivePermissions.assertActorCanGrantPermissionKeys,
    ).toHaveBeenCalledWith(['AUDIT_VIEW'], admin);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows removing a role whose permissions the actor does hold', async () => {
    const { service } = makeService({
      userRoleFindManyResult: [
        { role: { rolePermissions: [{ permission: { key: 'USERS_VIEW' } }] } },
      ],
      roleFindManyResult: [],
    });
    await expect(
      service.assignRolesToUser('user-1', [], admin),
    ).resolves.toBeUndefined();
  });
});
