import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '../exceptions.js';
import type { RequestWithId } from '../middleware/request-id.middleware.js';

const STATUS_CODE_MAP: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_FILE_TYPE',
  429: 'RATE_LIMITED',
};

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value))
    return false;
  const { error } = value as { error: unknown };
  // NestJS's built-in HttpException subclasses also put an `error` key on
  // their default body (e.g. `new ForbiddenException('msg')` yields
  // `{ message, error: 'Forbidden', statusCode }`), but there it's a plain
  // string description, not our { code, message } shape. Only ApiException's
  // own body has an object here, so that's what distinguishes the two.
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Maps every thrown exception to the docs/API.md error envelope
 * ({ error: { code, message, details?, requestId } }) and makes sure
 * unexpected errors never leak internals to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId & Request>();
    const requestId = request.requestId ?? 'unknown';

    // Health endpoints are operational, live outside /api/v1, and define
    // their own response shape (see HealthController) — leave them alone.
    if (
      request.path.startsWith('/health') &&
      exception instanceof HttpException
    ) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isApiErrorBody(body)) {
        response.status(status).json({ error: { ...body.error, requestId } });
        return;
      }

      const code = STATUS_CODE_MAP[status] ?? 'INTERNAL_ERROR';
      const rawMessage =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] })?.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.join(' ')
        : (rawMessage ?? exception.message);

      response.status(status).json({ error: { code, message, requestId } });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    });
  }
}
