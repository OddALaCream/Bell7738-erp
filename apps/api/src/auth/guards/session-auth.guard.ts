import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  AuthenticationRequiredException,
  SessionInvalidException,
} from '../../common/exceptions.js';
import { SessionService } from '../session.service.js';
import { TokenService } from '../token.service.js';
import type { AuthenticatedUser } from '../types.js';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Validates the access token AND re-checks the underlying session/user on
 * every request (docs/SECURITY.md: "V1 no optimiza esa comprobación con
 * caches que puedan mantener permisos obsoletos") — a valid JWT signature
 * alone is not enough; revocation/suspension must take effect immediately.
 *
 * This only establishes identity. Permission checks (Phase 6) compose on
 * top via a separate guard.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationRequiredException();
    }

    const token = authHeader.slice('Bearer '.length);
    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(token);
    } catch {
      throw new AuthenticationRequiredException();
    }

    const session = await this.sessions.findUsableSession(payload.sid);
    if (!session || session.userId !== payload.sub) {
      throw new SessionInvalidException();
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      isOwner: session.user.isOwner,
      sessionId: session.id,
    };
    return true;
  }
}
