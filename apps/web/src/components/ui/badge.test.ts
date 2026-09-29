import { describe, expect, it } from 'vitest';
import { readableTextColor } from './badge';

describe('readableTextColor', () => {
  it('uses dark text on the mid-tone colors where white text fails WCAG AA', () => {
    expect(readableTextColor('#0ea5e9')).toBe('#111111'); // sky-500
    expect(readableTextColor('#22c55e')).toBe('#111111');
    expect(readableTextColor('#f59e0b')).toBe('#111111');
  });

  it('uses white text on dark colors', () => {
    expect(readableTextColor('#7c3aed')).toBe('#ffffff');
    expect(readableTextColor('#1e3a8a')).toBe('#ffffff');
    expect(readableTextColor('#000000')).toBe('#ffffff');
  });

  it('falls back to a safe gray for an invalid color', () => {
    expect(readableTextColor('not-a-color')).toBe(readableTextColor('#6b7280'));
  });
});
