import { describe, expect, it } from 'vitest';
import { ApiError } from './api-types';

describe('ApiError', () => {
  it('keeps the winning revision and time of a REVISION_CONFLICT', () => {
    const error = new ApiError(409, {
      code: 'REVISION_CONFLICT',
      message: 'The meeting notes were changed by someone else. Reload and retry.',
      currentRevision: 4,
      updatedAt: '2026-09-28T15:00:00.000Z',
      requestId: 'req-1',
    });
    expect(error.isRevisionConflict).toBe(true);
    expect(error.currentRevision).toBe(4);
    expect(error.updatedAt).toBe('2026-09-28T15:00:00.000Z');
    expect(error.requestId).toBe('req-1');
  });

  it('does not treat other 409s as a revision conflict', () => {
    expect(new ApiError(409, { code: 'CONFLICT', message: 'Duplicate.' }).isRevisionConflict).toBe(false);
    expect(new ApiError(400, { code: 'REVISION_CONFLICT', message: 'x' }).isRevisionConflict).toBe(false);
  });
});
