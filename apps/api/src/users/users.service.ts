import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import {
  compareRoles,
  type RoleSummary,
} from '../rbac/effective-permissions.service.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { normalizeEmail } from '../common/normalize-email.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import type { ListUsersDto } from './dto/list-users.dto.js';
import type { ListTeamDto } from './dto/list-team.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { AuditContext } from '../audit/audit-context.decorator.js';
import type { AuditAction } from '../audit/audit-actions.js';

/** Role badges: presentation fields only, never the permissions a role grants. */
const USER_ROLES_SELECT = {
  select: {
    role: { select: { id: true, name: true, color: true, position: true } },
  },
} as const;

/** Prisma returns the join rows; the API exposes the role summaries. */
function withRoles<T extends { userRoles: Array<{ role: RoleSummary }> }>(
  row: T,
): Omit<T, 'userRoles'> & { roles: RoleSummary[] } {
  const { userRoles, ...rest } = row;
  return {
    ...rest,
    roles: userRoles.map((userRole) => userRole.role).sort(compareRoles),
  };
}

// Profile lists are bounded read models, not exhaustive exports.
const PROFILE_MEMBERSHIP_LIMIT = 200;
const PROFILE_ACTIVE_TASK_LIMIT = 50;
const PROFILE_COMPLETED_TASK_LIMIT = 20;
const ACTIVE_PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'PAUSED'];

function toDateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

/** Never includes passwordHash — see docs/API.md "nunca passwordHash ni tokens". */
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarStorageKey: true,
  status: true,
  isOwner: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  userRoles: USER_ROLES_SELECT,
} as const;

/**
 * docs/API.md /users/{userId}/profile and /team: visible to any active
 * teammate, so it deliberately excludes status/isOwner/lastLoginAt/
 * timestamps — "no revela administración" applies to viewing *someone
 * else's* profile, not your own (see ADMIN_USER_SELECT for /me/profile).
 */
const TEAM_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarStorageKey: true,
  userRoles: USER_ROLES_SELECT,
} as const;

type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ProjectAccessService,
  ) {}

  async list(query: ListUsersDto): Promise<PaginatedResult<unknown>> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.roleId
        ? { userRoles: { some: { roleId: query.roleId } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                firstName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const orderBy =
      query.sort === 'name'
        ? [{ firstName: query.order }, { lastName: query.order }]
        : query.sort === 'email'
          ? [{ email: query.order }]
          : [{ createdAt: query.order }];

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data.map(withRoles), total, query.page, query.pageSize);
  }

  async getById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ADMIN_USER_SELECT,
    });
    if (!user) throw new NotFoundException();
    return withRoles(user);
  }

  async update(
    userId: string,
    dto: UpdateUserDto,
    actorId: string,
    context?: AuditContext,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException();
    // docs/RBAC.md: the Owner's own record can't be touched by anyone else
    // through the admin endpoint — otherwise another USERS_UPDATE holder
    // could rename the Owner or force-revoke their sessions via an email
    // change.
    if (target.isOwner && actorId !== userId) throw new ForbiddenException();

    const emailChanged =
      dto.email !== undefined && normalizeEmail(dto.email) !== target.email;

    if (emailChanged) {
      const normalized = normalizeEmail(dto.email!);
      const existing = await this.prisma.user.findUnique({
        where: { email: normalized },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException();
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(emailChanged ? { email: normalizeEmail(dto.email!) } : {}),
        },
        select: ADMIN_USER_SELECT,
      });

      // docs/API.md: changing email revokes sessions (the account's identity changed).
      if (emailChanged) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      // docs/ARCHITECTURE.md: a critical change and its durable audit
      // event commit in the same transaction, not as a best-effort
      // side-effect afterward.
      await this.audit.logInTransaction(tx, {
        actorId,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: userId,
        metadata: { fields: Object.keys(dto) },
        context,
      });

      return withRoles(updated);
    });
  }

  async suspend(userId: string, actorId: string, context?: AuditContext) {
    // docs/RBAC.md: only ACTIVE accounts can be suspended — an INVITED
    // user has no password yet, and suspending then reactivating one would
    // otherwise hit the DB's ACTIVE-requires-password constraint directly.
    return this.setStatus(
      userId,
      'SUSPENDED',
      { fromStatuses: ['ACTIVE'], revokeSessions: true },
      actorId,
      'USER_SUSPENDED',
      context,
    );
  }

  async disable(userId: string, actorId: string, context?: AuditContext) {
    return this.setStatus(
      userId,
      'DISABLED',
      { fromStatuses: ['ACTIVE', 'SUSPENDED'], revokeSessions: true },
      actorId,
      'USER_DISABLED',
      context,
    );
  }

  async reactivate(userId: string, actorId: string, context?: AuditContext) {
    // docs/API.md: reactivate only moves SUSPENDED -> ACTIVE, and never
    // restores sessions (a fresh login is required regardless).
    return this.setStatus(
      userId,
      'ACTIVE',
      { fromStatuses: ['SUSPENDED'], revokeSessions: false },
      actorId,
      'USER_REACTIVATED',
      context,
    );
  }

  private async setStatus(
    userId: string,
    status: UserStatus,
    options: { fromStatuses: UserStatus[]; revokeSessions: boolean },
    actorId: string,
    auditAction: AuditAction,
    context?: AuditContext,
  ) {
    // docs/RBAC.md: "Un no-Owner ... no puede modificar su propio estado".
    if (userId.toLowerCase() === actorId.toLowerCase())
      throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      // Atomic conditional UPDATE: the isOwner/fromStatuses check and the
      // write happen in one statement, so a concurrent request can't slip
      // through on a stale read the way a separate check-then-write would
      // allow (docs/RBAC.md Owner protection + valid-transition guarantee).
      const { count } = await tx.user.updateMany({
        where: {
          id: userId,
          isOwner: false,
          status: { in: options.fromStatuses },
        },
        data: { status },
      });

      if (count === 0) {
        const target = await tx.user.findUnique({ where: { id: userId } });
        if (!target) throw new NotFoundException();
        if (target.isOwner) throw new ForbiddenException();
        throw new ConflictException();
      }

      if (options.revokeSessions) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.audit.logInTransaction(tx, {
        actorId,
        action: auditAction,
        entityType: 'User',
        entityId: userId,
        context,
      });

      return withRoles(
        await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: ADMIN_USER_SELECT,
        }),
      );
    });
  }

  /** docs/API.md /me/profile — full detail is fine, it's the caller's own data. */
  async getOwnProfile(actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: ADMIN_USER_SELECT,
    });
    if (!user) throw new NotFoundException();
    return {
      ...withRoles(user),
      ...(await this.getProfileExtras(user.id, actor)),
    };
  }

  /**
   * docs/API.md /users/{userId}/profile: "visible a usuarios activos ...
   * no revela administración". Uses the restricted, non-admin projection,
   * and 404s for a non-ACTIVE target so a regular teammate can't probe
   * which UUIDs belong to invited/suspended/disabled accounts.
   */
  async getPublicProfile(userId: string, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...TEAM_USER_SELECT, status: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new NotFoundException();
    // Explicit projection: nothing administrative can leak by adding a column
    // to the select above.
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarStorageKey: user.avatarStorageKey,
      roles: withRoles(user).roles,
      ...(await this.getProfileExtras(user.id, actor)),
    };
  }

  /**
   * docs/PRODUCT.md "Usuarios y perfiles": the person's projects and tasks,
   * restricted to what *the observer* may see — the same project scope as
   * every other listing, applied in the query. Looking at your own profile
   * therefore shows only your own visible projects too. Three queries in
   * total, whatever the number of projects (no per-project reads).
   */
  private async getProfileExtras(
    targetId: string,
    observer: AuthenticatedUser,
  ) {
    const scope = await this.access.buildProjectScope(observer);
    if (scope === null) {
      return {
        activeProjects: [],
        pastProjects: [],
        activeTasks: [],
        completedTasks: [],
      };
    }
    const projectWhere = { deletedAt: null, ...scope };
    const taskWhere = {
      deletedAt: null,
      project: projectWhere,
      assignees: { some: { userId: targetId } },
    };
    const taskSelect = {
      id: true,
      projectId: true,
      title: true,
      startDate: true,
      dueDate: true,
      status: true,
      completedAt: true,
      project: { select: { name: true } },
    } as const;

    const [memberships, activeTasks, completedTasks] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { userId: targetId, project: projectWhere },
        select: {
          role: true,
          removedAt: true,
          project: {
            select: {
              id: true,
              name: true,
              status: true,
              startDate: true,
              expectedEndDate: true,
            },
          },
        },
        orderBy: [{ project: { name: 'asc' } }, { projectId: 'asc' }],
        take: PROFILE_MEMBERSHIP_LIMIT,
      }),
      this.prisma.task.findMany({
        where: { ...taskWhere, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        select: taskSelect,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: PROFILE_ACTIVE_TASK_LIMIT,
      }),
      this.prisma.task.findMany({
        where: { ...taskWhere, status: 'DONE' },
        select: taskSelect,
        orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
        take: PROFILE_COMPLETED_TASK_LIMIT,
      }),
    ]);

    const activeProjects = [];
    const pastProjects = [];
    for (const { role, removedAt, project } of memberships) {
      const item = {
        id: project.id,
        name: project.name,
        status: project.status,
        role,
        startDate: toDateOnly(project.startDate),
        expectedEndDate: toDateOnly(project.expectedEndDate),
      };
      // A project is "anterior" once it is closed or the person left it.
      if (
        removedAt === null &&
        ACTIVE_PROJECT_STATUSES.includes(project.status)
      ) {
        activeProjects.push(item);
      } else {
        pastProjects.push(item);
      }
    }

    const toTaskItem = (task: (typeof activeTasks)[number]) => ({
      id: task.id,
      projectId: task.projectId,
      projectName: task.project.name,
      title: task.title,
      startDate: toDateOnly(task.startDate),
      dueDate: toDateOnly(task.dueDate),
      status: task.status,
      completedAt: task.completedAt,
    });

    return {
      activeProjects,
      pastProjects,
      activeTasks: activeTasks.map(toTaskItem),
      completedTasks: completedTasks.map(toTaskItem),
    };
  }

  async updateOwnProfile(userId: string, dto: UpdateProfileDto) {
    return withRoles(
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        },
        select: ADMIN_USER_SELECT,
      }),
    );
  }

  /** docs/API.md /team: only ACTIVE users, never INVITED/SUSPENDED/DISABLED. */
  async listTeam(query: ListTeamDto): Promise<PaginatedResult<unknown>> {
    const where = {
      status: 'ACTIVE' as const,
      ...(query.search
        ? {
            OR: [
              {
                firstName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: TEAM_USER_SELECT,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data.map(withRoles), total, query.page, query.pageSize);
  }
}
