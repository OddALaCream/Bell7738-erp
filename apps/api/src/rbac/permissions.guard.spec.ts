import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';
import { AuthenticationRequiredException } from '../common/exceptions.js';
import type { EffectivePermissionsService } from './effective-permissions.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

function makeContext(user?: AuthenticatedUser): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeReflector(required: string[] | undefined): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(required),
  } as unknown as Reflector;
}

const owner: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  isOwner: true,
  sessionId: 's1',
};
const plainUser: AuthenticatedUser = {
  id: 'user-1',
  email: 'user@example.com',
  isOwner: false,
  sessionId: 's2',
};

describe('PermissionsGuard', () => {
  it('allows any authenticated user when no permissions are required', async () => {
    const guard = new PermissionsGuard(
      makeReflector(undefined),
      {} as EffectivePermissionsService,
    );
    await expect(guard.canActivate(makeContext(plainUser))).resolves.toBe(true);
  });

  it('throws AuthenticationRequiredException if no user is attached (guard ordering bug)', async () => {
    const guard = new PermissionsGuard(
      makeReflector(['USERS_VIEW']),
      {} as EffectivePermissionsService,
    );
    await expect(
      guard.canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(AuthenticationRequiredException);
  });

  it('always allows the Owner, regardless of required permissions', async () => {
    const effectivePermissions = {
      getEffectivePermissionKeys: vi.fn(),
    } as unknown as EffectivePermissionsService;
    const guard = new PermissionsGuard(
      makeReflector(['USERS_VIEW', 'USERS_CREATE']),
      effectivePermissions,
    );
    await expect(guard.canActivate(makeContext(owner))).resolves.toBe(true);
    expect(
      effectivePermissions.getEffectivePermissionKeys,
    ).not.toHaveBeenCalled();
  });

  it('denies a non-owner without the required permission', async () => {
    const effectivePermissions = {
      getEffectivePermissionKeys: vi
        .fn()
        .mockResolvedValue(new Set(['USERS_VIEW'])),
    } as unknown as EffectivePermissionsService;
    const guard = new PermissionsGuard(
      makeReflector(['USERS_CREATE']),
      effectivePermissions,
    );
    await expect(guard.canActivate(makeContext(plainUser))).rejects.toThrow();
  });

  it('allows a non-owner who has all required permissions', async () => {
    const effectivePermissions = {
      getEffectivePermissionKeys: vi
        .fn()
        .mockResolvedValue(new Set(['USERS_VIEW', 'USERS_CREATE'])),
    } as unknown as EffectivePermissionsService;
    const guard = new PermissionsGuard(
      makeReflector(['USERS_VIEW', 'USERS_CREATE']),
      effectivePermissions,
    );
    await expect(guard.canActivate(makeContext(plainUser))).resolves.toBe(true);
  });

  it('denies when only some of several required permissions are present', async () => {
    const effectivePermissions = {
      getEffectivePermissionKeys: vi
        .fn()
        .mockResolvedValue(new Set(['USERS_VIEW'])),
    } as unknown as EffectivePermissionsService;
    const guard = new PermissionsGuard(
      makeReflector(['USERS_VIEW', 'USERS_CREATE']),
      effectivePermissions,
    );
    await expect(guard.canActivate(makeContext(plainUser))).rejects.toThrow();
  });
});
