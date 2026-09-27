import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticationRequiredException } from '../../common/exceptions.js';
import type { RequestWithUser } from '../guards/session-auth.guard.js';
import type { AuthenticatedUser } from '../types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new AuthenticationRequiredException();
    }
    return request.user;
  },
);
