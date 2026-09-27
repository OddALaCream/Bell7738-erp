import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';

const ROLE_DETAIL_SELECT = {
  id: true,
  name: true,
  description: true,
  color: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  rolePermissions: {
    select: {
      permission: { select: { id: true, key: true, description: true } },
    },
  },
} as const;

const ROLE_SUMMARY_SELECT = {
  id: true,
  name: true,
  color: true,
  position: true,
} as const;

function toDetail(role: {
  id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  rolePermissions: Array<{
    permission: { id: string; key: string; description: string };
  }>;
}) {
  const { rolePermissions, ...rest } = role;
  return { ...rest, permissions: rolePermissions.map((rp) => rp.permission) };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  /** docs/API.md: requires ROLES_VIEW *or* ROLES_MANAGE (either suffices) — @RequirePermissions is AND-only, so this is checked inline. */
  async listPermissions(actor: AuthenticatedUser) {
    if (!actor.isOwner) {
      const effective =
        await this.effectivePermissions.getEffectivePermissionKeys(actor.id);
      if (!effective.has('ROLES_VIEW') && !effective.has('ROLES_MANAGE')) {
        throw new ForbiddenException();
      }
    }

    return this.prisma.permission.findMany({
      select: { id: true, key: true, description: true },
      orderBy: { key: 'asc' },
    });
  }

  /**
   * docs/API.md: any active user gets badge summaries; ROLES_VIEW is
   * required to see full composition (permissions).
   */
  async listRoles(actor: AuthenticatedUser) {
    const canViewFull =
      actor.isOwner ||
      (
        await this.effectivePermissions.getEffectivePermissionKeys(actor.id)
      ).has('ROLES_VIEW');

    if (canViewFull) {
      const roles = await this.prisma.role.findMany({
        select: ROLE_DETAIL_SELECT,
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
      return roles.map(toDetail);
    }

    return this.prisma.role.findMany({
      select: ROLE_SUMMARY_SELECT,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async getById(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: ROLE_DETAIL_SELECT,
    });
    if (!role) throw new NotFoundException();
    return toDetail(role);
  }

  private async assertNameAvailable(
    name: string,
    excludeRoleId?: string,
  ): Promise<void> {
    const existing = await this.prisma.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing && existing.id !== excludeRoleId) {
      throw new ConflictException('A role with this name already exists.');
    }
  }

  async create(dto: CreateRoleDto, actor: AuthenticatedUser) {
    await this.assertNameAvailable(dto.name);
    await this.effectivePermissions.assertPermissionsExistAndActorCanGrant(
      dto.permissionIds,
      actor,
    );

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          name: dto.name,
          description: dto.description,
          color: dto.color,
          position: dto.position,
        },
      });
      if (dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            roleId: created.id,
            permissionId,
          })),
        });
      }
      return tx.role.findUniqueOrThrow({
        where: { id: created.id },
        select: ROLE_DETAIL_SELECT,
      });
    });

    return toDetail(role);
  }

  async update(roleId: string, dto: UpdateRoleDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        name: true,
        rolePermissions: { select: { permission: { select: { key: true } } } },
      },
    });
    if (!existing) throw new NotFoundException();

    if (
      dto.name !== undefined &&
      dto.name.toLowerCase() !== existing.name.toLowerCase()
    ) {
      await this.assertNameAvailable(dto.name, roleId);
    }
    if (dto.permissionIds !== undefined) {
      await this.effectivePermissions.assertPermissionsExistAndActorCanGrant(
        dto.permissionIds,
        actor,
      );

      // The check above only validates the actor can grant the complete NEW
      // set — it says nothing about permissions being removed. Without this,
      // a ROLES_MANAGE holder could strip a permission they don't hold (e.g.
      // AUDIT_VIEW) from every user assigned this role via a smaller
      // replacement set, which is the same outcome DELETE /roles/{id}
      // deliberately blocks for an assigned role.
      const newPermissions = await this.prisma.permission.findMany({
        where: { id: { in: dto.permissionIds } },
        select: { key: true },
      });
      const newKeys = new Set(
        newPermissions.map((permission) => permission.key),
      );
      const removedKeys = existing.rolePermissions
        .map((rolePermission) => rolePermission.permission.key)
        .filter((key) => !newKeys.has(key));
      await this.effectivePermissions.assertActorCanGrantPermissionKeys(
        removedKeys,
        actor,
      );
    }

    const role = await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
        },
      });

      if (dto.permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (dto.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permissionId) => ({
              roleId,
              permissionId,
            })),
          });
        }
      }

      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        select: ROLE_DETAIL_SELECT,
      });
    });

    return toDetail(role);
  }

  async delete(roleId: string): Promise<void> {
    const existing = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!existing) throw new NotFoundException();

    await this.prisma.$transaction(async (tx) => {
      const [userRoleCount, invitationRoleCount] = await Promise.all([
        tx.userRole.count({ where: { roleId } }),
        tx.invitationRole.count({ where: { roleId } }),
      ]);
      // docs/RBAC.md: "Los roles asignados no se eliminan silenciosamente."
      if (userRoleCount > 0 || invitationRoleCount > 0) {
        throw new ConflictException(
          'This role is still assigned; remove all assignments first.',
        );
      }

      // RolePermission -> Role uses onDelete: Restrict, so it must be
      // cleared explicitly before the role itself can be deleted.
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.role.delete({ where: { id: roleId } });
    });
  }

  /**
   * docs/API.md PUT /users/{userId}/roles. Lives here (not UsersService)
   * since it's fundamentally an RBAC operation, even though the route is
   * nested under /users in the URL.
   */
  async assignRolesToUser(
    userId: string,
    roleIds: string[],
    actor: AuthenticatedUser,
  ): Promise<void> {
    // docs/RBAC.md: "Un no-Owner ... no puede modificar sus propios roles."
    // Compared case-insensitively: ParseUUIDPipe preserves the caller's
    // casing verbatim, so an uppercase spelling of the same UUID must not
    // slip past this check.
    if (userId.toLowerCase() === actor.id.toLowerCase())
      throw new ForbiddenException();

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException();
    // Owner has no roles conceptually — "no aparece en RolePermission".
    if (target.isOwner) throw new ForbiddenException();

    await this.effectivePermissions.assertRolesExistAndActorCanGrant(
      roleIds,
      actor,
    );

    // The check above only validates the actor can grant every permission
    // implied by the NEW role set — it says nothing about roles being
    // removed. Without this, an actor could strip a permission they don't
    // hold (e.g. AUDIT_VIEW) from the target simply by omitting that role
    // from the replacement set.
    const [currentUserRoles, newRoles] = await Promise.all([
      this.prisma.userRole.findMany({
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
      }),
      this.prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: {
          rolePermissions: {
            select: { permission: { select: { key: true } } },
          },
        },
      }),
    ]);
    const newKeys = new Set(
      newRoles.flatMap((role) =>
        role.rolePermissions.map((rp) => rp.permission.key),
      ),
    );
    const removedKeys = currentUserRoles
      .flatMap((userRole) =>
        userRole.role.rolePermissions.map((rp) => rp.permission.key),
      )
      .filter((key) => !newKeys.has(key));
    await this.effectivePermissions.assertActorCanGrantPermissionKeys(
      removedKeys,
      actor,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId,
            roleId,
            assignedById: actor.id,
          })),
        });
      }
    });
  }
}
