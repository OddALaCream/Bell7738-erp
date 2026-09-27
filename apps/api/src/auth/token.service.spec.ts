import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service.js';
import type { AppConfigService } from '../config/app-config.service.js';

function makeConfig(): AppConfigService {
  return {
    auth: {
      accessTokenSecret: 'a'.repeat(32),
      refreshTokenSecret: 'b'.repeat(32),
      refreshTokenHashSecret: 'c'.repeat(32),
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
  } as unknown as AppConfigService;
}

describe('TokenService', () => {
  const config = makeConfig();
  const jwt = new JwtService({});
  const tokens = new TokenService(jwt, config);

  it('round-trips an access token', async () => {
    const token = await tokens.signAccessToken('user-1', 'session-1');
    const payload = await tokens.verifyAccessToken(token);
    expect(payload).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      type: 'access',
    });
  });

  it('round-trips a refresh token', async () => {
    const token = await tokens.signRefreshToken('user-1', 'session-1', 'jti-1');
    const payload = await tokens.verifyRefreshToken(token);
    expect(payload).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      type: 'refresh',
      jti: 'jti-1',
    });
  });

  it('rejects a refresh token presented as an access token', async () => {
    const refreshToken = await tokens.signRefreshToken(
      'user-1',
      'session-1',
      'jti-1',
    );
    await expect(tokens.verifyAccessToken(refreshToken)).rejects.toThrow();
  });

  it('rejects an access token presented as a refresh token', async () => {
    const accessToken = await tokens.signAccessToken('user-1', 'session-1');
    await expect(tokens.verifyRefreshToken(accessToken)).rejects.toThrow();
  });

  it('rejects a token signed with a different secret', async () => {
    const otherConfig = makeConfig();
    (otherConfig.auth as { accessTokenSecret: string }).accessTokenSecret =
      'z'.repeat(32);
    const otherTokens = new TokenService(jwt, otherConfig);
    const token = await otherTokens.signAccessToken('user-1', 'session-1');
    await expect(tokens.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects an expired access token', async () => {
    const expired = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', type: 'access' },
      { secret: config.auth.accessTokenSecret, expiresIn: -10 },
    );
    await expect(tokens.verifyAccessToken(expired)).rejects.toThrow();
  });

  it('hashes refresh tokens deterministically and compares in constant time', () => {
    const hash = tokens.hashRefreshToken('some-raw-token');
    expect(tokens.hashRefreshToken('some-raw-token')).toBe(hash);
    expect(tokens.refreshTokenHashMatches('some-raw-token', hash)).toBe(true);
    expect(tokens.refreshTokenHashMatches('a-different-token', hash)).toBe(
      false,
    );
  });
});
