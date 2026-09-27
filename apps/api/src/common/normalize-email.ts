/** Matches DATABASE.md: "Email: trim y lowercase antes de persistir". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
