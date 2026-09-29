function readEnv(key: string, fallback?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Fallbacks only: the real limits come from `GET /auth/me` (`capabilities.uploads`),
// so an operator changing MAX_UPLOAD_BYTES never needs to rebuild the web app. The
// server stays the authority and its 413/415 answers are always surfaced.
const DEFAULT_MAX_UPLOAD_BYTES = '26214400';
const DEFAULT_DOCUMENT_EXTENSIONS = 'pdf,doc,docx,xls,xlsx,ppt,pptx,png,jpg,jpeg,gif,webp,txt,csv,zip';

// A production build is served by the same Caddy that proxies `/api`, so the
// API lives on the page's own origin (the CSP allows only `connect-src 'self'`).
// Only `vite dev` needs an absolute URL for the API on another port.
const DEFAULT_API_BASE_URL = import.meta.env.PROD ? '/api/v1' : 'http://localhost:3000/api/v1';

export const env = {
  apiBaseUrl: readEnv('VITE_API_BASE_URL', DEFAULT_API_BASE_URL),
  maxUploadBytes: Number(readEnv('VITE_MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES)),
  documentExtensions: readEnv('VITE_DOCUMENT_ALLOWED_EXTENSIONS', DEFAULT_DOCUMENT_EXTENSIONS)
    .split(',')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean),
};