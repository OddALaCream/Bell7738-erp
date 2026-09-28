import { AuthService } from './auth.service.js';
import {
  InvalidCredentialsException,
  SessionInvalidException,
} from '../common/exceptions.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PasswordService } from './password.service.js';
import type { SessionService } from './session.service.js';
import type { TokenService } from './token.service.js';
import type { AuditService } from '../audit/audit.service.js';

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    passwordHash: 'hashed',
    firstName: 'Owner',
    lastName: 'Account',
    avatarStorageKey: null,
    isOwner: false,
    status: 'ACTIVE',
    ...overrides,
  };
}

function makeService(overrides?: {
  user?: ReturnType<typeof makeUser> | null;
  passwordVerifies?: boolean;
}) {
  const user = overrides?.user === undefined ? makeUser() : overrides.user;
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      findUniqueOrThrow: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    // The callback form receives `prisma` itself as `tx` — fine for these
    // unit tests since the mock doesn't model real transactional isolation.
    $transaction: vi.fn((arg) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
    ),
  } as unknown as PrismaService;

  const password = {
    verify: vi.fn().mockResolvedValue(overrides?.passwordVerifies ?? true),
    hash: vi.fn().mockResolvedValue('new-hash'),
  } as unknown as PasswordService;

  const sessions = {
    createSession: vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresInSeconds: 900,
    }),
    rotateSession: vi.fn(),
    reissueTokens: vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      accessTokenExpiresInSeconds: 900,
    }),
    revokeSession: vi.fn(),
    revokeAllSessionsForUser: vi.fn(),
    listSessionsForUser: vi.fn().mockResolvedValue([]),
    findOwnSession: vi.fn(),
  } as unknown as SessionService;

  const tokens = {
    verifyRefreshToken: vi.fn().mockResolvedValue({
      sub: 'user-1',
      sid: 'session-1',
      type: 'refresh',
      jti: 'j1',
    }),
  } as unknown as TokenService;

  const audit = {
    log: vi.fn(),
    logInTransaction: vi.fn(),
  } as unknown as AuditService;
  return {
    auth: new AuthService(prisma, password, sessions, tokens, audit),
    audit,
    prisma,
    password,
    sessions,
    tokens,
  };
}

describe('AuthService.login', () => {
  it('does not create a session if credentials or status changed during verification', async () => {
    const { auth, prisma, sessions } = makeService();
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
    await expect(
      auth.login('owner@example.com', 'old-password', {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(sessions.createSession).not.toHaveBeenCalled();
  });
  it('throws a generic error when the user does not exist', async () => {
    const { auth } = makeService({ user: null });
    await expect(
      auth.login('nobody@example.com', 'whatever', {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('still runs an Argon2 verification for a nonexistent user (timing side-channel mitigation)', async () => {
    const { auth, password } = makeService({ user: null });
    await expect(
      auth.login('nobody@example.com', 'whatever', {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    // No real hash exists, so it must fall back to a dummy one rather than
    // skip verification entirely — otherwise this path is measurably faster
    // than a wrong-password attempt against a real account.
    expect(password.hash).toHaveBeenCalled();
    expect(password.verify).toHaveBeenCalledWith('new-hash', 'whatever');
  });

  it('throws the same generic error for a suspended user, even with the correct password', async () => {
    const { auth, password } = makeService({
      user: makeUser({ status: 'SUSPENDED' }),
      passwordVerifies: true,
    });
    await expect(
      auth.login('owner@example.com', 'correct', {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    // Still runs verify() to avoid a timing signal distinguishing this from a wrong-password failure.
    expect(password.verify).toHaveBeenCalled();
  });

  it('throws for an INVITED user with no password set yet', async () => {
    const { auth } = makeService({
      user: makeUser({ status: 'INVITED', passwordHash: null }),
    });
    await expect(
      auth.login('owner@example.com', 'anything', {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('throws the same generic error for a wrong password on an active user', async () => {
    const { auth } = makeService({ passwordVerifies: false });
    await expect(
      auth.login('owner@example.com', 'wrong', {}),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('issues tokens and records lastLoginAt on success', async () => {
    const { auth, sessions, prisma } = makeService({ passwordVerifies: true });
    const result = await auth.login('owner@example.com', 'correct', {
      ip: '127.0.0.1',
    });
    expect(result.accessToken).toBe('access-token');
    expect(result.user.email).toBe('owner@example.com');
    expect(sessions.createSession).toHaveBeenCalledWith(
      'user-1',
      {
        ip: '127.0.0.1',
      },
      prisma,
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        passwordHash: 'hashed',
        status: 'ACTIVE',
        email: 'owner@example.com',
      },
      data: { lastLoginAt: expect.any(Date) },
    });
  });
});

describe('AuthService.refresh', () => {
  it('does not burn a valid session because of an operational rotation failure', async () => {
    const { auth, sessions } = makeService();
    vi.mocked(sessions.rotateSession).mockRejectedValue(
      new Error('database temporarily unavailable'),
    );
    await expect(auth.refresh('token')).rejects.toThrow(
      /temporarily unavailable/,
    );
    expect(sessions.revokeSession).not.toHaveBeenCalled();
  });
  it('rejects a token that fails signature verification', async () => {
    const { auth, tokens } = makeService();
    (tokens.verifyRefreshToken as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('bad signature'),
    );
    await expect(auth.refresh('garbage')).rejects.toBeInstanceOf(
      SessionInvalidException,
    );
  });

  it('treats any rotation failure (hash mismatch/replay) as compromise: revokes the session and rejects', async () => {
    const { auth, sessions } = makeService();
    (sessions.rotateSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('REFRESH_ROTATION_FAILED'),
    );
    await expect(auth.refresh('stale-token')).rejects.toBeInstanceOf(
      SessionInvalidException,
    );
    expect(sessions.revokeSession).toHaveBeenCalledWith('session-1');
  });

  it('also revokes (idempotently) when the session was already revoked/expired/suspended', async () => {
    const { auth, sessions } = makeService();
    (sessions.rotateSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('REFRESH_ROTATION_FAILED'),
    );
    await expect(auth.refresh('token')).rejects.toBeInstanceOf(
      SessionInvalidException,
    );
    // Revoking an already-revoked/expired session is a harmless no-op at
    // the DB layer, so AuthService doesn't try to distinguish the reason.
    expect(sessions.revokeSession).toHaveBeenCalledWith('session-1');
  });

  it('rotates successfully for a valid, matching refresh token', async () => {
    const { auth, sessions } = makeService();
    (sessions.rotateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessionId: 'session-1',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      accessTokenExpiresInSeconds: 900,
    });
    const result = await auth.refresh('valid-token');
    expect(result.accessToken).toBe('new-access');
  });
});

describe('AuthService.changePassword', () => {
  it('rejects a stale verified password instead of overwriting a concurrent change', async () => {
    const { auth, prisma, sessions } = makeService();
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
    await expect(
      auth.changePassword(
        'user-1',
        'session-1',
        'old-password',
        'new-password',
      ),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(sessions.reissueTokens).not.toHaveBeenCalled();
  });
  it('rejects an incorrect current password', async () => {
    const { auth } = makeService({ passwordVerifies: false });
    await expect(
      auth.changePassword('user-1', 'session-1', 'wrong', 'newpassword123'),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('updates the hash and revokes every other session, keeping the current one', async () => {
    const { auth, sessions, prisma } = makeService({ passwordVerifies: true });
    await auth.changePassword(
      'user-1',
      'session-1',
      'correct',
      'newpassword123',
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', passwordHash: 'hashed', status: 'ACTIVE' },
      data: { passwordHash: 'new-hash' },
    });
    // Both calls receive the transaction client as their third argument —
    // that's the whole point of the fix (atomicity across all three steps).
    expect(sessions.revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      prisma,
    );
    expect(sessions.reissueTokens).toHaveBeenCalledWith(
      'session-1',
      'user-1',
      prisma,
    );
  });
});

describe('AuthService.revokeOwnSession', () => {
  it("returns false for a session that isn't the caller's own (never leaks existence)", async () => {
    const { auth, sessions } = makeService();
    (sessions.findOwnSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    await expect(
      auth.revokeOwnSession('user-1', 'someone-elses-session'),
    ).resolves.toBe(false);
    expect(sessions.revokeSession).not.toHaveBeenCalled();
  });

  it('revokes a session the caller owns', async () => {
    const { auth, sessions } = makeService();
    (sessions.findOwnSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'session-2',
    });
    await expect(auth.revokeOwnSession('user-1', 'session-2')).resolves.toBe(
      true,
    );
    expect(sessions.revokeSession).toHaveBeenCalledWith(
      'session-2',
      expect.anything(),
    );
  });
});
