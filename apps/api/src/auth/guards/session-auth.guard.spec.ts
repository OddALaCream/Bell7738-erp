import type { ExecutionContext } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard.js';
import {
  AuthenticationRequiredException,
  SessionInvalidException,
} from '../../common/exceptions.js';
import type { TokenService } from '../token.service.js';
import type { SessionService } from '../session.service.js';

function contextWithHeader(authorization?: string): ExecutionContext {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionAuthGuard', () => {
  it('rejects a request with no Authorization header', async () => {
    const guard = new SessionAuthGuard(
      {} as TokenService,
      {} as SessionService,
    );
    await expect(guard.canActivate(contextWithHeader())).rejects.toBeInstanceOf(
      AuthenticationRequiredException,
    );
  });

  it('rejects a malformed Authorization header', async () => {
    const guard = new SessionAuthGuard(
      {} as TokenService,
      {} as SessionService,
    );
    await expect(
      guard.canActivate(contextWithHeader('Basic abc123')),
    ).rejects.toBeInstanceOf(AuthenticationRequiredException);
  });

  it('rejects a token that fails signature/expiry verification', async () => {
    const tokens = {
      verifyAccessToken: vi.fn().mockRejectedValue(new Error('invalid')),
    } as unknown as TokenService;
    const guard = new SessionAuthGuard(tokens, {} as SessionService);
    await expect(
      guard.canActivate(contextWithHeader('Bearer bad.token.here')),
    ).rejects.toBeInstanceOf(AuthenticationRequiredException);
  });

  it('rejects a valid token whose session is revoked, expired, or missing', async () => {
    const tokens = {
      verifyAccessToken: vi
        .fn()
        .mockResolvedValue({ sub: 'u1', sid: 's1', type: 'access' }),
    } as unknown as TokenService;
    const sessions = {
      findUsableSession: vi.fn().mockResolvedValue(null),
    } as unknown as SessionService;
    const guard = new SessionAuthGuard(tokens, sessions);
    await expect(
      guard.canActivate(contextWithHeader('Bearer valid.looking.token')),
    ).rejects.toBeInstanceOf(SessionInvalidException);
  });

  it('rejects when the session belongs to a different user than the token claims', async () => {
    const tokens = {
      verifyAccessToken: vi
        .fn()
        .mockResolvedValue({ sub: 'attacker', sid: 's1', type: 'access' }),
    } as unknown as TokenService;
    const sessions = {
      findUsableSession: vi.fn().mockResolvedValue({
        id: 's1',
        userId: 'real-owner',
        user: {
          id: 'real-owner',
          email: 'x@example.com',
          isOwner: false,
          status: 'ACTIVE',
        },
      }),
    } as unknown as SessionService;
    const guard = new SessionAuthGuard(tokens, sessions);
    await expect(
      guard.canActivate(contextWithHeader('Bearer token')),
    ).rejects.toBeInstanceOf(SessionInvalidException);
  });

  it('attaches the authenticated user on success', async () => {
    const tokens = {
      verifyAccessToken: vi
        .fn()
        .mockResolvedValue({ sub: 'u1', sid: 's1', type: 'access' }),
    } as unknown as TokenService;
    const sessions = {
      findUsableSession: vi.fn().mockResolvedValue({
        id: 's1',
        userId: 'u1',
        user: {
          id: 'u1',
          email: 'owner@example.com',
          isOwner: true,
          status: 'ACTIVE',
        },
      }),
    } as unknown as SessionService;
    const guard = new SessionAuthGuard(tokens, sessions);
    const context = contextWithHeader('Bearer valid.token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<{ user: unknown }>();
    expect(request.user).toEqual({
      id: 'u1',
      email: 'owner@example.com',
      isOwner: true,
      sessionId: 's1',
    });
  });
});
