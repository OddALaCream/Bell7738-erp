import type { CookieOptions, Response } from 'express';
import { durationToMs } from '../common/duration.js';
import type { AppConfigService } from '../config/app-config.service.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';
/** docs/SECURITY.md: scope the cookie to exactly the routes that read it. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function cookieOptions(
  config: AppConfigService,
  maxAgeMs?: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

export function setRefreshCookie(
  res: Response,
  config: AppConfigService,
  refreshToken: string,
): void {
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    cookieOptions(config, durationToMs(config.auth.refreshTokenTtl)),
  );
}

export function clearRefreshCookie(
  res: Response,
  config: AppConfigService,
): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(config));
}
