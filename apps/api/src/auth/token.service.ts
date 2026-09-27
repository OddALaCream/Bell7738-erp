import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/app-config.service.js';
import { durationToSeconds } from '../common/duration.js';
import type { AccessTokenPayload, RefreshTokenPayload } from './types.js';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async signAccessToken(userId: string, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      sid: sessionId,
      type: 'access',
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.auth.accessTokenSecret,
      expiresIn: durationToSeconds(this.config.auth.accessTokenTtl),
    });
  }

  async signRefreshToken(
    userId: string,
    sessionId: string,
    jti: string,
  ): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: userId,
      sid: sessionId,
      type: 'refresh',
      jti,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.auth.refreshTokenSecret,
      expiresIn: durationToSeconds(this.config.auth.refreshTokenTtl),
    });
  }

  /** Throws if the token is malformed, expired, or not an access token. */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.auth.accessTokenSecret,
    });
    if (payload.type !== 'access') {
      throw new Error('Not an access token');
    }
    return payload;
  }

  /** Throws if the token is malformed, expired, or not a refresh token. */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.config.auth.refreshTokenSecret,
    });
    if (payload.type !== 'refresh') {
      throw new Error('Not a refresh token');
    }
    return payload;
  }

  /**
   * docs/SECURITY.md: refresh tokens have high entropy, so an HMAC-SHA-256
   * keyed with a secret independent from the JWT secrets is sufficient
   * storage — Argon2id is reserved for human passwords.
   */
  hashRefreshToken(rawToken: string): string {
    return createHmac('sha256', this.config.auth.refreshTokenHashSecret)
      .update(rawToken)
      .digest('hex');
  }

  refreshTokenHashMatches(rawToken: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hashRefreshToken(rawToken), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    if (candidate.length !== stored.length) return false;
    return timingSafeEqual(candidate, stored);
  }
}
