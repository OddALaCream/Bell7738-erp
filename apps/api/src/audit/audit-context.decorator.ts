import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithId } from '../common/middleware/request-id.middleware.js';

export interface AuditContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

/** Pulls the forensic fields docs/DATABASE.md's AuditLog wants (requestId/ip/userAgent) off the current request. */
export const CurrentAuditContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditContext => {
    const request = ctx.switchToHttp().getRequest<RequestWithId>();
    return {
      requestId: request.requestId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    };
  },
);
