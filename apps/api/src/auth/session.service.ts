import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { durationToMs, durationToSeconds } from '../common/duration.js';
import { TokenService } from './token.service.js';
import type { Prisma, Session } from '../generated/prisma/client.js';

/** Any Prisma client or interactive-transaction client — lets callers compose these operations into a larger transaction. */
type Db = PrismaService | Prisma.TransactionClient;

export interface IssuedTokens {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
}

export interface RequestMetadata {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly tokens: TokenService,
  ) {}

  private get accessTtlSeconds(): number {
    return durationToSeconds(this.config.auth.accessTokenTtl);
  }

  private get refreshTtlMs(): number {
    return durationToMs(this.config.auth.refreshTokenTtl);
  }

  async createSession(
    userId: string,
    metadata: RequestMetadata,
  ): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const refreshToken = await this.tokens.signRefreshToken(
      userId,
      sessionId,
      randomUUID(),
    );
    const now = new Date();

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
        userAgent: metadata.userAgent?.slice(0, 512),
        ip: metadata.ip,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + this.refreshTtlMs),
      },
    });

    const accessToken = await this.tokens.signAccessToken(userId, sessionId);
    return {
      sessionId,
      accessToken,
      refreshToken,
      accessTokenExpiresInSeconds: this.accessTtlSeconds,
    };
  }

  /**
   * Loads a session by id only if it is usable right now: not revoked, not
   * expired, and belonging to a still-ACTIVE user. Every authenticated
   * request and every refresh re-checks this — no cached permissions.
   */
  async findUsableSession(sessionId: string): Promise<
    | (Session & {
        user: { id: string; email: string; isOwner: boolean; status: string };
      })
    | null
  > {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: { id: true, email: true, isOwner: true, status: true },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date())
      return null;
    if (session.user.status !== 'ACTIVE') return null;
    return session;
  }

  /**
   * Rotates the refresh token for a session via a single atomic conditional
   * UPDATE — `WHERE refreshTokenHash = <the one just presented>` — rather
   * than a separate read-then-write. Postgres guarantees only one of two
   * concurrent callers presenting the same (stolen) token can ever match
   * that WHERE clause, since the first to commit changes the hash out from
   * under the second; a prior read-then-write allowed both to pass the
   * comparison and both mint valid tokens. Also re-checks the user's status
   * here (not just in SessionAuthGuard), so a suspension takes effect on
   * the next refresh even if its session-revocation step raced with this.
   *
   * Throws REFRESH_ROTATION_FAILED for every failure reason alike (hash
   * mismatch/replay, already revoked, expired, or user no longer ACTIVE) —
   * the caller (AuthService) always revokes on this error, which is a safe,
   * idempotent action regardless of which reason applied.
   */
  async rotateSession(
    sessionId: string,
    userId: string,
    presentedRefreshToken: string,
  ): Promise<IssuedTokens> {
    const newRefreshToken = await this.tokens.signRefreshToken(
      userId,
      sessionId,
      randomUUID(),
    );
    const now = new Date();

    const { count } = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        refreshTokenHash: this.tokens.hashRefreshToken(presentedRefreshToken),
        revokedAt: null,
        expiresAt: { gt: now },
        user: { status: 'ACTIVE' },
      },
      data: {
        refreshTokenHash: this.tokens.hashRefreshToken(newRefreshToken),
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + this.refreshTtlMs),
      },
    });

    if (count === 0) {
      throw new Error('REFRESH_ROTATION_FAILED');
    }

    const accessToken = await this.tokens.signAccessToken(userId, sessionId);
    return {
      sessionId,
      accessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresInSeconds: this.accessTtlSeconds,
    };
  }

  /**
   * Issues a fresh token pair for an already-authenticated session without
   * requiring the caller to present the current refresh token — used by
   * change-password, where the client authenticates via currentPassword
   * instead. Unlike rotateSession, this performs no hash-match check.
   *
   * Accepts an optional transaction client so change-password can compose
   * this with the password update and other-session revocation atomically.
   */
  async reissueTokens(
    sessionId: string,
    userId: string,
    db: Db = this.prisma,
  ): Promise<IssuedTokens> {
    const newRefreshToken = await this.tokens.signRefreshToken(
      userId,
      sessionId,
      randomUUID(),
    );
    const now = new Date();
    await db.session.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: this.tokens.hashRefreshToken(newRefreshToken),
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + this.refreshTtlMs),
      },
    });

    const accessToken = await this.tokens.signAccessToken(userId, sessionId);
    return {
      sessionId,
      accessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresInSeconds: this.accessTtlSeconds,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessionsForUser(
    userId: string,
    exceptSessionId?: string,
    db: Db = this.prisma,
  ): Promise<void> {
    await db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  async listSessionsForUser(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Ownership-scoped: returns null (never another user's session) instead of throwing. */
  async findOwnSession(
    userId: string,
    sessionId: string,
  ): Promise<Session | null> {
    return this.prisma.session.findFirst({ where: { id: sessionId, userId } });
  }
}
