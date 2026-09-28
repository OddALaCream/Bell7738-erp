import { SessionService } from './session.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AppConfigService } from '../config/app-config.service.js';
import type { TokenService } from './token.service.js';

function fixture() {
  const now = new Date();
  const session = {
    id: 'session',
    userId: 'user',
    revokedAt: null as Date | null,
    expiresAt: new Date(now.getTime() + 60000),
    user: { id: 'user', status: 'ACTIVE' },
  };
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue(session),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const config = {
    auth: { accessTokenTtl: '15m', refreshTokenTtl: '7d' },
  } as unknown as AppConfigService;
  const tokens = {
    signRefreshToken: vi.fn().mockResolvedValue('new-refresh'),
    hashRefreshToken: vi.fn((token: string) => `hash:${token}`),
    signAccessToken: vi.fn().mockResolvedValue('access'),
  } as unknown as TokenService;
  return {
    service: new SessionService(prisma, config, tokens),
    prisma,
    tokens,
    session,
  };
}

describe('Session validity', () => {
  it.each(['SUSPENDED', 'DISABLED', 'INVITED'])(
    'rejects %s even with a live session',
    async (status) => {
      const { service, session } = fixture();
      session.user.status = status;
      expect(await service.findUsableSession('session')).toBeNull();
    },
  );
  it('rejects revoked and expired sessions immediately', async () => {
    const { service, session } = fixture();
    session.revokedAt = new Date();
    expect(await service.findUsableSession('session')).toBeNull();
    session.revokedAt = null;
    session.expiresAt = new Date(0);
    expect(await service.findUsableSession('session')).toBeNull();
  });
  it('does not reissue credentials for a revoked session', async () => {
    const { service, prisma, tokens } = fixture();
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 });
    await expect(service.reissueTokens('session', 'user')).rejects.toThrow();
    expect(tokens.signAccessToken).not.toHaveBeenCalled();
  });
  it('does not rotate a session belonging to another subject', async () => {
    const { service, prisma } = fixture();
    await service.rotateSession('session', 'other-user', 'refresh');
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'other-user' }),
      }),
    );
  });
});
