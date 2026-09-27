import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from '../common/normalize-email.js';
import {
  InvalidCredentialsException,
  SessionInvalidException,
} from '../common/exceptions.js';
import { PasswordService } from './password.service.js';
import {
  SessionService,
  type IssuedTokens,
  type RequestMetadata,
} from './session.service.js';
import { TokenService } from './token.service.js';
import type { Session, User } from '../generated/prisma/client.js';

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
  isOwner: boolean;
  status: string;
}

function toUserSummary(user: User): UserSummary {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarStorageKey: user.avatarStorageKey,
    isOwner: user.isOwner,
    status: user.status,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Lazily-computed, cached Argon2id hash of a fixed placeholder, verified
   * against when there's no real hash to check (unknown email, INVITED
   * user). Without this, those paths return near-instantly while a real
   * account runs a ~100ms Argon2 verification, letting an attacker
   * distinguish "no such account" from "account exists" by response time
   * alone even though the error body is identical either way.
   */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
  ) {}

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.password.hash(
      'timing-attack-mitigation-placeholder',
    );
    return this.dummyHash;
  }

  async login(
    email: string,
    plainPassword: string,
    metadata: RequestMetadata,
  ): Promise<IssuedTokens & { user: UserSummary }> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });

    // Deliberately generic: never reveal which of these failed, including
    // via timing — every branch below runs exactly one Argon2 verification.
    if (!user || !user.passwordHash || user.status !== 'ACTIVE') {
      const hashToCheck = user?.passwordHash ?? (await this.getDummyHash());
      await this.password.verify(hashToCheck, plainPassword);
      throw new InvalidCredentialsException();
    }

    const passwordMatches = await this.password.verify(
      user.passwordHash,
      plainPassword,
    );
    if (!passwordMatches) {
      throw new InvalidCredentialsException();
    }

    const issued = await this.sessions.createSession(user.id, metadata);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User ${user.id} logged in`);
    return { ...issued, user: toUserSummary(user) };
  }

  async refresh(rawRefreshToken: string): Promise<IssuedTokens> {
    let payload;
    try {
      payload = await this.tokens.verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new SessionInvalidException();
    }

    try {
      return await this.sessions.rotateSession(
        payload.sid,
        payload.sub,
        rawRefreshToken,
      );
    } catch {
      // Whatever the exact reason (hash mismatch/replay, already revoked,
      // expired, or the user is no longer ACTIVE), revoking here is always
      // safe: it's a no-op if already revoked, and the right defensive
      // action if a validly-signed token's hash no longer matches.
      this.logger.warn(`Refresh rejected for session ${payload.sid}`);
      await this.sessions.revokeSession(payload.sid);
      throw new SessionInvalidException();
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revokeSession(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    // No exception for the current session: docs/API.md says logout-all
    // "no deja activa la sesión que ejecuta la operación".
    await this.sessions.revokeAllSessionsForUser(userId);
  }

  async listSessions(userId: string): Promise<Session[]> {
    return this.sessions.listSessionsForUser(userId);
  }

  async revokeOwnSession(userId: string, sessionId: string): Promise<boolean> {
    const session = await this.sessions.findOwnSession(userId, sessionId);
    if (!session) return false;
    await this.sessions.revokeSession(sessionId);
    return true;
  }

  async me(userId: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return toUserSummary(user);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (
      !user.passwordHash ||
      !(await this.password.verify(user.passwordHash, currentPassword))
    ) {
      throw new InvalidCredentialsException();
    }

    const newHash = await this.password.hash(newPassword);

    // All three effects of a password change are one atomic unit: a partial
    // failure must never leave the password changed but other sessions
    // (potentially compromised credentials) still active.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
      await this.sessions.revokeAllSessionsForUser(
        userId,
        currentSessionId,
        tx,
      );
      // Rotating the current session's own refresh token too keeps its
      // credential fresh after a password change, per docs/API.md.
      return this.sessions.reissueTokens(currentSessionId, userId, tx);
    });

    this.logger.log(`User ${userId} changed their password`);
    return result;
  }
}
