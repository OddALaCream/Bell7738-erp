const UNITS = ['KB', 'MB', 'GB'] as const;

/** "512 B", "1,5 KB", "25 MB" — binary units, matching how the server's byte limits are written. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString('es', { maximumFractionDigits: value >= 10 ? 0 : 1 })} ${UNITS[unit]}`;
}
