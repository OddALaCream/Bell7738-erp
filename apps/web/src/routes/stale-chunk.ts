/**
 * A dynamic import that fails because the file was replaced by a newer
 * deploy. Browsers word it differently, so match the known messages.
 */
const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
];

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));
}
