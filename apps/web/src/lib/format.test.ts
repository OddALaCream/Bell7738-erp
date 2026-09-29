import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('uses bytes below 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('scales through KB, MB and GB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3 GB');
  });

  it('renders the default upload limit as 25 MB', () => {
    expect(formatBytes(26214400)).toBe('25 MB');
  });
});
