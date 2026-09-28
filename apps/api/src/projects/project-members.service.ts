import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectAccessService } from './project-access.service.js';
import { ActivityService } from '../activity/activity.service.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AddProjectMemberDto } from './dto/add-project-member.dto.js';
import type { UpdateProjectMemberDto } from './dto/update-project-member.dto.js';

type Db = PrismaService | Prisma.TransactionClient;

const MEMBER_SELECT = {
  userId: true,
  role: true,
  joinedAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarStorageKey: true,
    },
  },
} as const;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(projectId: string, actor: AuthenticatedUser) {
    await this.access.assertCanViewProject(actor, projectId);
    return this.prisma.projectMember.findMany({
      where: { projectId, removedAt: null },
      select: MEMBER_SELECT,
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  async add(
    projectId: string,
    dto: AddProjectMemberDto,
    actor: AuthenticatedUser,
  ) {
    await this.access.assertCanViewProject(actor, projectId);
    if (
      !(await this.access.canManageProject(
        actor,
        projectId,
        'PROJECT_MEMBERS_MANAGE',
      ))
    ) {
      throw new ForbiddenException();
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!targetUser || targetUser.status !== 'ACTIVE') {
      throw new BadRequestException('userId must belong to an active user.');
    }

    return this.prisma
      .$transaction(async (tx) => {
        await this.assertProjectNotDeleted(tx, projectId);

        const existing = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: dto.userId } },
        });
        if (existing && existing.removedAt === null) {
          throw new ConflictException(
            'User is already an active member of this project.',
          );
        }

        // ProjectMember's PK is (projectId, userId) — a previously removed
        // membership is the same row, so rejoining is an UPDATE, not an
        // INSERT (see docs/DATABASE.md: history stays on the one row).
        if (existing) {
          return tx.projectMember.update({
            where: { projectId_userId: { projectId, userId: dto.userId } },
            data: {
              role: dto.role,
              addedById: actor.id,
              removedAt: null,
              joinedAt: new Date(),
            },
            select: MEMBER_SELECT,
          });
        }
        return tx.projectMember.create({
          data: {
            projectId,
            userId: dto.userId,
            role: dto.role,
            addedById: actor.id,
          },
          select: MEMBER_SELECT,
        });
      })
      .then(async (member) => {
        await this.activity.record({
          projectId,
          actorId: actor.id,
          type: 'PROJECT_MEMBER_ADDED',
          entityType: 'ProjectMember',
          entityId: dto.userId,
          metadata: { role: dto.role },
        });
        return member;
      });
  }

  async updateRole(
    projectId: string,
    userId: string,
    dto: UpdateProjectMemberDto,
    actor: AuthenticatedUser,
  ) {
    await this.access.assertCanViewProject(actor, projectId);
    if (
      !(await this.access.canManageProject(
        actor,
        projectId,
        'PROJECT_MEMBERS_MANAGE',
      ))
    ) {
      throw new ForbiddenException();
    }

    return this.prisma
      .$transaction(async (tx) => {
        await this.assertProjectNotDeleted(tx, projectId);

        const membership = await tx.projectMember.findFirst({
          where: { projectId, userId, removedAt: null },
        });
        if (!membership) throw new NotFoundException();

        if (membership.role === 'MANAGER' && dto.role !== 'MANAGER') {
          await this.assertNotLastManager(tx, projectId, userId);
        }

        return tx.projectMember.update({
          where: { projectId_userId: { projectId, userId } },
          data: { role: dto.role },
          select: MEMBER_SELECT,
        });
      })
      .then(async (member) => {
        await this.activity.record({
          projectId,
          actorId: actor.id,
          type: 'PROJECT_MEMBER_ROLE_CHANGED',
          entityType: 'ProjectMember',
          entityId: userId,
          metadata: { role: dto.role },
        });
        return member;
      });
  }

  async remove(
    projectId: string,
    userId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.access.assertCanViewProject(actor, projectId);
    if (
      !(await this.access.canManageProject(
        actor,
        projectId,
        'PROJECT_MEMBERS_MANAGE',
      ))
    ) {
      throw new ForbiddenException();
    }

    await this.prisma.$transaction(async (tx) => {
      await this.assertProjectNotDeleted(tx, projectId);

      const membership = await tx.projectMember.findFirst({
        where: { projectId, userId, removedAt: null },
      });
      if (!membership) throw new NotFoundException();

      if (membership.role === 'MANAGER') {
        await this.assertNotLastManager(tx, projectId, userId);
      }

      await tx.projectMember.update({
        where: { projectId_userId: { projectId, userId } },
        data: { removedAt: new Date() },
      });
    });

    await this.activity.record({
      projectId,
      actorId: actor.id,
      type: 'PROJECT_MEMBER_REMOVED',
      entityType: 'ProjectMember',
      entityId: userId,
    });
  }

  // A concurrently-committed DELETE (soft-delete) isn't otherwise visible to
  // this transaction until it starts, and the project row itself isn't part
  // of what these methods write — re-checking it here at the top of the
  // transaction, rather than back in the caller, keeps the TOCTOU window as
  // small as the transaction itself instead of the whole request.
  private async assertProjectNotDeleted(
    tx: Db,
    projectId: string,
  ): Promise<void> {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { deletedAt: true },
    });
    if (!project || project.deletedAt) throw new NotFoundException();
  }

  // docs/RBAC.md: "Un manager no puede retirar al último manager activo si
  // con ello el proyecto queda sin responsable." FOR UPDATE locks the
  // project's active-manager rows for the rest of this transaction, so a
  // concurrent demote/remove of a DIFFERENT manager can't read the same
  // "still >=2 managers" snapshot and also proceed to zero.
  private async assertNotLastManager(
    tx: Db,
    projectId: string,
    excludingUserId: string,
  ): Promise<void> {
    const managers = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT "userId" FROM "project_members"
      WHERE "projectId" = ${projectId}::uuid AND "role" = 'MANAGER' AND "removedAt" IS NULL
      FOR UPDATE
    `;
    const otherActiveManagers = managers.filter(
      (manager) => manager.userId !== excludingUserId,
    ).length;
    if (otherActiveManagers === 0) {
      throw new ConflictException(
        'Cannot remove or demote the last active manager of this project.',
      );
    }
  }
}
