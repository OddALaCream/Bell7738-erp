import { describe, expect, it } from 'vitest';
import { readInvitationToken } from './invitation-token';

describe('readInvitationToken', () => {
  it('reads the token from the fragment the API puts in the link', () => {
    expect(readInvitationToken('#token=abc_DEF-123', '')).toBe('abc_DEF-123');
  });

  it('still accepts a query parameter', () => {
    expect(readInvitationToken('', '?token=from-query')).toBe('from-query');
  });

  it('prefers the fragment when both are present', () => {
    expect(readInvitationToken('#token=frag', '?token=query')).toBe('frag');
  });

  it('returns an empty string when there is no token', () => {
    expect(readInvitationToken('', '')).toBe('');
    expect(readInvitationToken('#other=1', '?x=2')).toBe('');
  });
});
