import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { normalizeEmail } from '../common/normalize-email.js';
import { paginate, type PaginatedResult } from '../common/pagination.js';
import { EffectivePermissionsService } from '../rbac/effective-permissions.service.js';
import { InvitationInvalidException } from './invitation.exceptions.js';
import type { AuthenticatedUser } from '../auth/types.js';
import type { CreateInvitationDto } from './dto/create-invitation.dto.js';
import type { ListInvitationsDto } from './dto/list-invitations.dto.js';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto.js';

const INVITATION_SELECT = {
  id: true,
  userId: true,
  invitedById: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  user: {
    select: { email: true, firstName: true, lastName: true, status: true },
  },
} as const;

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken(): string {
  // 256 bits, per docs/SECURITY.md "Invitaciones".
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  /**
   * docs/SECURITY.md says this link is only shown when SMTP isn't
   * configured (otherwise an email is sent instead). No mailer exists yet
   * anywhere in this codebase, so gating on config.smtp.enabled would mean
   * a misconfigured/half-set-up SMTP block silently loses the only way to
   * activate the account. Always returning it is the safer interim
   * behavior; revisit once an actual mail sender is implemented. The
   * fragment (#), not a query param, keeps the token out of access logs.
   */
  private buildManualLink(rawToken: string): string {
    return `${this.config.app.webOrigin}/accept-invitation#token=${rawToken}`;
  }

  /**
   * docs/RBAC.md anti-escalation: an inviter can only grant roles whose
   * permissions are within their own effective set (Owner bypasses this).
   * Also doubles as existence validation for roleIds — a nonexistent UUID
   * would otherwise only surface as an unhandled FK-violation 500 later.
   */
  private async assertCanGrantRoles(
    roleIds: string[],
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (roleIds.length === 0) return;

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: {
        id: true,
        rolePermissions: { select: { permission: { select: { key: true } } } },
      },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roleIds do not exist.');
    }

    if (actor.isOwner) return;

    const actorPermissions =
      await this.effectivePermissions.getEffectivePermissionKeys(actor.id);
    for (const role of roles) {
      for (const rolePermission of role.rolePermissions) {
        if (!actorPermissions.has(rolePermission.permission.key)) {
          throw new ForbiddenException(
            'Cannot grant a role containing a permission you do not hold.',
          );
        }
      }
    }
  }

  async create(dto: CreateInvitationDto, actor: AuthenticatedUser) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException();
    }

    await this.assertCanGrantRoles(dto.roleIds, actor);

    const rawToken = generateRawToken();
    const expiresAt = new Date(
      Date.now() + this.config.auth.invitationTtlHours * 60 * 60 * 1000,
    );

    const invitation = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: 'INVITED',
        },
      });
      const created = await tx.invitation.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          invitedById: actor.id,
          expiresAt,
        },
        select: INVITATION_SELECT,
      });
      if (dto.roleIds.length > 0) {
        await tx.invitationRole.createMany({
          data: dto.roleIds.map((roleId) => ({
            invitationId: created.id,
            roleId,
          })),
        });
      }
      return created;
    });

    return {
      ...this.toSummary(invitation),
      manualLink: this.buildManualLink(rawToken),
    };
  }

  async list(query: ListInvitationsDto): Promise<PaginatedResult<unknown>> {
    const now = new Date();
    const statusWhere =
      query.status === 'accepted'
        ? { acceptedAt: { not: null } }
        : query.status === 'revoked'
          ? { acceptedAt: null, revokedAt: { not: null } }
          : query.status === 'expired'
            ? { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } }
            : query.status === 'pending'
              ? { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }
              : {};

    const [rows, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where: statusWhere,
        select: INVITATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invitation.count({ where: statusWhere }),
    ]);

    return paginate(
      rows.map((row) => this.toSummary(row)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async resend(invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { user: true },
    });
    if (!invitation) throw new NotFoundException();
    if (invitation.user.status !== 'INVITED') {
      // Already accepted (or otherwise no longer pending) — nothing to resend.
      throw new ConflictException();
    }

    const rawToken = generateRawToken();
    const expiresAt = new Date(
      Date.now() + this.config.auth.invitationTtlHours * 60 * 60 * 1000,
    );
    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { tokenHash: hashToken(rawToken), expiresAt, revokedAt: null },
      select: INVITATION_SELECT,
    });

    return {
      ...this.toSummary(updated),
      manualLink: this.buildManualLink(rawToken),
    };
  }

  async revoke(invitationId: string): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { user: true },
    });
    if (!invitation) throw new NotFoundException();

    // docs/API.md: idempotent on an already-revoked invitation; never
    // changes an already-active user.
    if (invitation.user.status !== 'INVITED' || invitation.revokedAt) return;

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
  }

  async accept(dto: AcceptInvitationDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    // Hashing first (pure CPU, essentially never throws) so the one thing
    // that can realistically fail happens *before* we claim the invitation
    // inside the transaction below — a failure there would otherwise leave
    // acceptedAt set with no password/ACTIVE status ever applied.
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Atomic compare-and-claim: only succeeds if the invitation is
      // currently usable. This closes the race where a concurrent accept
      // (same token) or a concurrent revoke/resend could otherwise let a
      // read-then-write implementation apply stale state.
      const { count } = await tx.invitation.updateMany({
        where: {
          tokenHash,
          revokedAt: null,
          acceptedAt: null,
          expiresAt: { gt: now },
          user: { status: 'INVITED' },
        },
        data: { acceptedAt: now },
      });

      if (count === 0) {
        // Generic per docs/SECURITY.md: never reveal which check failed.
        throw new InvitationInvalidException();
      }

      const invitation = await tx.invitation.findUniqueOrThrow({
        where: { tokenHash },
        include: { invitationRoles: true },
      });

      await tx.user.update({
        where: { id: invitation.userId },
        data: { passwordHash, status: 'ACTIVE' },
      });
      if (invitation.invitationRoles.length > 0) {
        await tx.userRole.createMany({
          data: invitation.invitationRoles.map((invitationRole) => ({
            userId: invitation.userId,
            roleId: invitationRole.roleId,
            assignedById: invitation.invitedById,
          })),
        });
      }
    });
  }

  private toSummary(invitation: {
    id: string;
    userId: string;
    invitedById: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    user: {
      email: string;
      firstName: string;
      lastName: string;
      status: string;
    };
  }) {
    const now = new Date();
    const status = invitation.acceptedAt
      ? 'accepted'
      : invitation.revokedAt
        ? 'revoked'
        : invitation.expiresAt <= now
          ? 'expired'
          : 'pending';

    return {
      id: invitation.id,
      email: invitation.user.email,
      firstName: invitation.user.firstName,
      lastName: invitation.user.lastName,
      invitedById: invitation.invitedById,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      status,
    };
  }
}
