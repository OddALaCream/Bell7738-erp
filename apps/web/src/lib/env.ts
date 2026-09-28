function readEnv(key: string, fallback?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Defaults mirror the backend's (apps/api/.env.example). The API doesn't expose
// its upload limits, so these only drive early feedback in the UI — the server
// stays the authority and its 413/415 answers are always surfaced.
const DEFAULT_MAX_UPLOAD_BYTES = '26214400';
const DEFAULT_DOCUMENT_EXTENSIONS = 'pdf,doc,docx,xls,xlsx,ppt,pptx,png,jpg,jpeg,gif,webp,txt,csv,zip';

export const env = {
  apiBaseUrl: readEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1'),
  maxUploadBytes: Number(readEnv('VITE_MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES)),
  documentExtensions: readEnv('VITE_DOCUMENT_ALLOWED_EXTENSIONS', DEFAULT_DOCUMENT_EXTENSIONS)
    .split(',')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean),
};