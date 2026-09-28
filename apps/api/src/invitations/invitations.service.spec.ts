import { ConflictException } from '@nestjs/common';
import { InvitationsService } from './invitations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppConfigService } from '../config/app-config.service.js';
import type { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  isOwner: false,
  sessionId: 's2',
};

function makeService(overrides?: {
  existingUser?: unknown;
  assertRolesRejects?: Error;
}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(overrides?.existingUser ?? null),
    },
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

  // The anti-escalation/existence check itself is unit-tested directly in
  // effective-permissions.service.spec.ts — here we only verify
  // InvitationsService actually calls it and reacts to its outcome.
  const assertRolesExistAndActorCanGrant = overrides?.assertRolesRejects
    ? vi.fn().mockRejectedValue(overrides.assertRolesRejects)
    : vi.fn().mockResolvedValue(undefined);
  const effectivePermissions = {
    assertRolesExistAndActorCanGrant,
  } as unknown as EffectivePermissionsService;

  const audit = {
    log: vi.fn().mockResolvedValue(undefined),
    logInTransaction: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  return {
    service: new InvitationsService(
      prisma,
      config,
      effectivePermissions,
      audit,
    ),
    prisma,
    effectivePermissions,
    audit,
  };
}

describe('InvitationsService.create', () => {
  const dto = {
    email: 'new@example.com',
    firstName: 'New',
    lastName: 'Hire',
    roleIds: ['role-1'],
  };

  it('rejects inviting an email that already belongs to a user', async () => {
    const { service } = makeService({ existingUser: { id: 'existing-1' } });
    await expect(
      service.create({ ...dto, roleIds: [] }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('delegates role validation/anti-escalation to EffectivePermissionsService before creating anything', async () => {
    const { service, effectivePermissions, prisma } = makeService();
    await service.create(dto, admin);
    expect(
      effectivePermissions.assertRolesExistAndActorCanGrant,
    ).toHaveBeenCalledWith(['role-1'], admin);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('propagates a rejection from the anti-escalation check without creating the user', async () => {
    const rejection = new Error('nope');
    const { service, prisma } = makeService({ assertRolesRejects: rejection });
    await expect(service.create(dto, admin)).rejects.toBe(rejection);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('includes a manualLink in the response (no mailer implemented yet)', async () => {
    const { service } = makeService();
    const result = await service.create({ ...dto, roleIds: [] }, admin);
    expect(result.manualLink).toContain('#token=');
  });
});
