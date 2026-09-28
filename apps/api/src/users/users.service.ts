import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizeEmail } from '../common/normalize-email.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import type { ListUsersDto } from './dto/list-users.dto.js';
import type { ListTeamDto } from './dto/list-team.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { AuditContext } from '../audit/audit-context.decorator.js';
import type { AuditAction } from '../audit/audit-actions.js';

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
} as const;

type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    return paginate(data, total, query.page, query.pageSize);
  }

  async getById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ADMIN_USER_SELECT,
    });
    if (!user) throw new NotFoundException();
    return user;
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

      return updated;
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

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: ADMIN_USER_SELECT,
      });
    });
  }

  private static readonly EMPTY_PROFILE_EXTRAS = {
    roles: [] as string[],
    activeProjects: [] as unknown[],
    pastProjects: [] as unknown[],
    activeTasks: [] as unknown[],
    completedTasks: [] as unknown[],
  };

  /** docs/API.md /me/profile — full detail is fine, it's the caller's own data. */
  async getOwnProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: ADMIN_USER_SELECT,
    });
    if (!user) throw new NotFoundException();
    return { ...user, ...UsersService.EMPTY_PROFILE_EXTRAS };
  }

  /**
   * docs/API.md /users/{userId}/profile: "visible a usuarios activos ...
   * no revela administración". Uses the restricted, non-admin projection,
   * and 404s for a non-ACTIVE target so a regular teammate can't probe
   * which UUIDs belong to invited/suspended/disabled accounts.
   */
  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...TEAM_USER_SELECT, status: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new NotFoundException();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarStorageKey: user.avatarStorageKey,
      ...UsersService.EMPTY_PROFILE_EXTRAS,
    };
  }

  async updateOwnProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      },
      select: ADMIN_USER_SELECT,
    });
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

    return paginate(data, total, query.page, query.pageSize);
  }
}
