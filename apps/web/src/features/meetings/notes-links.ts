/** Only web and mail links are accepted; a bare host gets `https://`. Returns null if unusable. */
export function normalizeLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
