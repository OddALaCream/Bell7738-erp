import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInstallSnoozed, readInstallDismissedAt, writeInstallDismissedAt } from './install';

const DAY = 24 * 60 * 60 * 1000;

describe('isInstallSnoozed', () => {
  it('is not snoozed before any dismissal', () => {
    expect(isInstallSnoozed(null, 1_000)).toBe(false);
  });

  it('stays snoozed for 30 days, then the card may return', () => {
    const at = 1_000_000;
    expect(isInstallSnoozed(at, at + 29 * DAY)).toBe(true);
    expect(isInstallSnoozed(at, at + 31 * DAY)).toBe(false);
  });
});

describe('install dismissal storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage(store: Record<string, string>) {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
  }

  it('round-trips the timestamp', () => {
    stubStorage({});
    expect(readInstallDismissedAt()).toBeNull();
    writeInstallDismissedAt(123);
    expect(readInstallDismissedAt()).toBe(123);
  });

  it('ignores a corrupted value', () => {
    stubStorage({ 'erp:install-prompt-dismissed-at': 'not-a-number' });
    expect(readInstallDismissedAt()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readInstallDismissedAt()).toBeNull();
    expect(() => writeInstallDismissedAt(1)).not.toThrow();
  });
});
