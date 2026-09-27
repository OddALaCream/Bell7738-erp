import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/types.js';

/**
 * docs/RBAC.md: "Los permisos efectivos de un usuario son la unión de sus
 * roles." Owner bypass lives in PermissionsGuard, not here — this only
 * computes the role-derived set, since Owner "no aparece en RolePermission".
 */
@Injectable()
export class EffectivePermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissionKeys(userId: string): Promise<Set<string>> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        keys.add(rolePermission.permission.key);
      }
    }
    return keys;
  }

  /**
   * docs/RBAC.md anti-escalation, applied everywhere a non-Owner can grant
   * capability to someone else (inviting with roles, creating/editing a
   * role's permission set, assigning roles to a user): "no puede asignar
   * un rol que contenga permisos fuera de su propio conjunto efectivo."
   * Owner bypasses since Owner's effective set is implicitly "everything".
   */
  async assertActorCanGrantPermissionKeys(
    permissionKeys: Iterable<string>,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (actor.isOwner) return;

    const actorPermissions = await this.getEffectivePermissionKeys(actor.id);
    for (const key of permissionKeys) {
      if (!actorPermissions.has(key)) {
        throw new ForbiddenException(
          'Cannot grant a permission you do not hold.',
        );
      }
    }
  }

  /**
   * Resolves roleIds to their granted permission keys, validating every id
   * exists (otherwise a nonexistent UUID would only surface as an unhandled
   * FK-violation 500 later), then applies the anti-escalation check above.
   * Shared by invitation creation, role create/update, and user role
   * assignment — anywhere a set of roleIds is about to be granted.
   */
  async assertRolesExistAndActorCanGrant(
    roleIds: string[],
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (roleIds.length === 0) return;

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: {
        rolePermissions: { select: { permission: { select: { key: true } } } },
      },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roleIds do not exist.');
    }

    const permissionKeys = roles.flatMap((role) =>
      role.rolePermissions.map((rp) => rp.permission.key),
    );
    await this.assertActorCanGrantPermissionKeys(permissionKeys, actor);
  }

  /**
   * Same idea as assertRolesExistAndActorCanGrant, but for a role's own
   * permissionIds (Permission table ids) — used when creating/editing a
   * Role itself, as opposed to granting existing roles to someone.
   */
  async assertPermissionsExistAndActorCanGrant(
    permissionIds: string[],
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (permissionIds.length === 0) return;

    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { key: true },
    });
    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('One or more permissionIds do not exist.');
    }

    await this.assertActorCanGrantPermissionKeys(
      permissions.map((permission) => permission.key),
      actor,
    );
  }
}
