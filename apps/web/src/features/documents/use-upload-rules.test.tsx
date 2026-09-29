// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { makeCan } from '@/lib/permissions';
import type { CurrentUser } from '@/types/domain';
import { useUploadRules } from './use-upload-rules';

function providerFor(uploads: { maxBytes: number; allowedExtensions: string[] }) {
  const user = { capabilities: { uploads } } as CurrentUser;
  const value = { user, can: makeCan([]) } as unknown as AuthContextValue;
  return ({ children }: { children: ReactNode }) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

describe('useUploadRules', () => {
  afterEach(cleanup);

  it('uses the limits the backend reports, not the ones baked into the build', () => {
    const { result } = renderHook(() => useUploadRules(), {
      wrapper: providerFor({ maxBytes: 50 * 1024 * 1024, allowedExtensions: ['pdf', 'svg'] }),
    });
    expect(result.current).toEqual({ maxBytes: 50 * 1024 * 1024, extensions: ['pdf', 'svg'] });
  });

  it('falls back to the build-time defaults before the person is known', () => {
    const { result } = renderHook(() => useUploadRules());
    expect(result.current.maxBytes).toBe(26214400);
    expect(result.current.extensions).toContain('pdf');
  });
});
