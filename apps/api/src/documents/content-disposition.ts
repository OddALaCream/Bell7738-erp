/**
 * RFC 6266/5987-safe `Content-Disposition: attachment` header: an ASCII
 * fallback for older clients plus a UTF-8 extended filename*= for the rest.
 * Strips quotes/control characters so a crafted originalName can't break
 * out of the header or inject additional directives.
 */
export function buildContentDisposition(filename: string): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
