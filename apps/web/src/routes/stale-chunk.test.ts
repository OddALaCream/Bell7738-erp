import { describe, expect, it } from 'vitest';
import { isStaleChunkError } from './stale-chunk';

describe('isStaleChunkError', () => {
  it('recognizes the browsers\' dynamic import failures', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a-1.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});
