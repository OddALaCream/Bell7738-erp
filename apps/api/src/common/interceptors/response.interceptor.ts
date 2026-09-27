import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

/**
 * Wraps successful responses in docs/API.md's { data: ... } envelope.
 * A handler that already returns { data, meta } (paginated collections)
 * passes through unchanged; a 204/void response stays empty. Health
 * endpoints live outside the /api/v1 product API and its conventions, so
 * they're left untouched.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.startsWith('/health')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((value: unknown) => {
        if (value === undefined) return value;
        if (value !== null && typeof value === 'object' && 'data' in value)
          return value;
        return { data: value };
      }),
    );
  }
}
