import { useContext, useMemo } from 'react';
import { env } from '@/lib/env';
import { AuthContext } from '@/features/auth/auth-context';
import type { UploadRules } from './upload-rules';

/**
 * The limits the backend reports in `GET /auth/me` (`capabilities.uploads`), so
 * changing MAX_UPLOAD_BYTES or the allowed extensions never needs a new web
 * build. The build-time values are only a fallback; the server still validates
 * every file.
 */
export function useUploadRules(): UploadRules {
  const uploads = useContext(AuthContext)?.user?.capabilities?.uploads;
  return useMemo(
    () =>
      uploads
        ? { maxBytes: uploads.maxBytes, extensions: uploads.allowedExtensions }
        : { maxBytes: env.maxUploadBytes, extensions: env.documentExtensions },
    [uploads],
  );
}
