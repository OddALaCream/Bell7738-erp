import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * docs/API.md "Concurrencia": on a stale `expectedRevision`, the API returns
 * 409 REVISION_CONFLICT with the CURRENT revision and updatedAt so the
 * client can re-fetch and retry, without overwriting the newer notes. Not
 * built on the ApiException base (whose body is strictly {code, message,
 * details?}) since this needs extra fields — the exception filter's
 * isApiErrorBody check only requires `error.code`, so this body still
 * passes straight through untouched.
 */
export class MeetingNotesRevisionConflictException extends HttpException {
  constructor(currentRevision: number, updatedAt: Date | null) {
    super(
      {
        error: {
          code: 'REVISION_CONFLICT',
          message:
            'The meeting notes were changed by someone else. Reload and retry.',
          currentRevision,
          updatedAt,
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}
