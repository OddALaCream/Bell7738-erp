import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticationRequiredException } from '../common/exceptions.js';
import type { RequestWithUser } from '../auth/guards/session-auth.guard.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import { REQUIRE_PERMISSIONS_KEY } from './require-permissions.decorator.js';

/**
 * docs/RBAC.md "Algoritmo de autorización", steps 3-4 only (steps 1-2 are
 * SessionAuthGuard's job and must run first; steps 5-8, project-scoped
 * authorization, are Phase 6/7). Roles/permissions are re-read on every
 * request — never cached — so a revoked role takes effect immediately.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      // SessionAuthGuard must run before this guard on every protected route.
      throw new AuthenticationRequiredException();
    }

    if (user.isOwner) return true;

    const effective =
      await this.effectivePermissions.getEffectivePermissionKeys(user.id);
    const hasAll = required.every((permission) => effective.has(permission));
    if (!hasAll) {
      throw new ForbiddenException();
    }
    return true;
  }
}
