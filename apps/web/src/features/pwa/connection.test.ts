import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-types';
import { isNetworkFailure } from './connection';

describe('isNetworkFailure', () => {
  it('is true for a request that got no HTTP answer', () => {
    expect(isNetworkFailure(new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network Error' }))).toBe(true);
  });

  it('is false when the server answered, even with an error', () => {
    expect(isNetworkFailure(new ApiError(500, { code: 'INTERNAL_ERROR', message: 'x' }))).toBe(false);
    expect(isNetworkFailure(new ApiError(404, { code: 'NOT_FOUND', message: 'x' }))).toBe(false);
  });

  it('is false for unrelated errors', () => {
    expect(isNetworkFailure(new Error('boom'))).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});
