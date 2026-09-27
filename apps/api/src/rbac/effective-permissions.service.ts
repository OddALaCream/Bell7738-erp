import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
}
