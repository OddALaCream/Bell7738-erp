const DISMISSED_KEY = 'erp:install-prompt-dismissed-at';
/** After "Ahora no" the install card stays away this long (docs/UI-UX.md: discreet and dismissible). */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function isInstallSnoozed(dismissedAt: number | null, now: number): boolean {
  return dismissedAt !== null && now - dismissedAt < SNOOZE_MS;
}

/**
 * Storage is a per-viewer convenience only: it can be blocked, full or
 * cleared (private windows), and the app must behave the same without it.
 */
export function readInstallDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeInstallDismissedAt(at: number): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(at));
  } catch {
    // Not persisting the dismissal just means the card may reappear next visit.
  }
}
