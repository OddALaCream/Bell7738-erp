import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorDetail {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

/** Base for exceptions that already carry the docs/API.md error envelope shape. */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    const body: ApiErrorBody = {
      error: { code, message, ...(details ? { details } : {}) },
    };
    super(body, status);
  }
}

export class AuthenticationRequiredException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    );
  }
}

/** Deliberately generic: login must not reveal whether the account exists. */
export class InvalidCredentialsException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      'Invalid email or password.',
    );
  }
}

export class SessionInvalidException extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'SESSION_INVALID',
      'Your session is no longer valid.',
    );
  }
}
