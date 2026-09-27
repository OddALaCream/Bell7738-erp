import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/exceptions.js';

/** docs/API.md: INVITATION_INVALID -> 400/410, generic (never says which check failed). */
export class InvitationInvalidException extends ApiException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      'INVITATION_INVALID',
      'This invitation link is no longer valid.',
    );
  }
}
