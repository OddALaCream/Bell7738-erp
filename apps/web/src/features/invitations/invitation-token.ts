/**
 * The API's invitation link carries the token in the URL fragment
 * (`/accept-invitation#token=…`) so it never reaches an access log
 * (docs/SECURITY.md "Invitaciones"). A `?token=` query is still accepted so
 * an older or hand-built link keeps working.
 */
export function readInvitationToken(hash: string, search: string): string {
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  if (fromHash) return fromHash;
  return new URLSearchParams(search).get('token') ?? '';
}
