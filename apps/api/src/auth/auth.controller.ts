import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service.js';
import { SessionInvalidException } from '../common/exceptions.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import type { AuthenticatedUser } from './types.js';
import {
  CurrentAuditContext,
  type AuditContext,
} from '../audit/audit-context.decorator.js';

// Vitest sets NODE_ENV=test automatically; relax the limits there so a test
// file exercising several login/refresh calls doesn't trip its own throttle.
const isTestEnv = process.env.NODE_ENV === 'test';
const LOGIN_THROTTLE = {
  default: { limit: isTestEnv ? 1000 : 5, ttl: 60_000 },
};
const REFRESH_THROTTLE = {
  default: { limit: isTestEnv ? 1000 : 20, ttl: 60_000 },
};

/**
 * docs/SECURITY.md: "validación de Origin contra el origen web permitido en
 * peticiones de navegador" for the cookie-authenticated endpoints. Browsers
 * always send Origin on cross-origin POSTs (and same-origin ones in modern
 * browsers); a non-browser client that omits it entirely is allowed through,
 * since this check specifically targets browser-driven cross-site requests
 * riding the ambient refresh cookie, not API clients using no cookie at all.
 */
function assertTrustedOrigin(req: Request, config: AppConfigService): void {
  const origin = req.headers.origin;
  if (origin && origin !== config.app.webOrigin) {
    throw new ForbiddenException();
  }
}

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  @Post('login')
  @Throttle(LOGIN_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentAuditContext() context: AuditContext,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const result = await this.auth.login(
      dto.email,
      dto.password,
      {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
      context,
    );
    setRefreshCookie(res, this.config, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.accessTokenExpiresInSeconds,
      user: result.user,
    };
  }

  @Post('refresh')
  @Throttle(REFRESH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentAuditContext() context: AuditContext,
  ) {
    assertTrustedOrigin(req, this.config);
    res.setHeader('Cache-Control', 'no-store');
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      throw new SessionInvalidException();
    }

    const result = await this.auth.refresh(rawToken, context);
    setRefreshCookie(res, this.config, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.accessTokenExpiresInSeconds,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<void> {
    assertTrustedOrigin(req, this.config);
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawToken) {
      let sessionId: string | undefined;
      try {
        sessionId = (await this.tokens.verifyRefreshToken(rawToken)).sid;
      } catch {
        // Malformed/expired/wrong-secret token — nothing to revoke, but
        // still idempotent from the client's point of view.
      }
      // Deliberately outside the catch above: a real DB failure here must
      // surface as a 500, not silently report a bogus 204 success while the
      // session stays live.
      if (sessionId) {
        await this.auth.logout(sessionId, context);
      }
    }
    clearRefreshCookie(res, this.config);
  }

  @Post('logout-all')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<void> {
    await this.auth.logoutAll(user.id, context);
    clearRefreshCookie(res, this.config);
  }

  @Get('sessions')
  @UseGuards(SessionAuthGuard)
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    const sessions = await this.auth.listSessions(user.id);
    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      isCurrent: session.id === user.sessionId,
    }));
  }

  @Delete('sessions/:sessionId')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuditContext() context: AuditContext,
  ): Promise<void> {
    const revoked = await this.auth.revokeOwnSession(
      user.id,
      sessionId,
      context,
    );
    if (!revoked) {
      // Another user's session ID must look identical to "not found".
      throw new NotFoundException();
    }
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
    @CurrentAuditContext() context: AuditContext,
  ) {
    const result = await this.auth.changePassword(
      user.id,
      user.sessionId,
      dto.currentPassword,
      dto.newPassword,
      context,
    );
    setRefreshCookie(res, this.config, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.accessTokenExpiresInSeconds,
    };
  }
}
