import { describe, expect, it } from 'vitest';
import { normalizeLinkHref } from './notes-links';

describe('normalizeLinkHref', () => {
  it('keeps http(s) and mailto links', () => {
    expect(normalizeLinkHref('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeLinkHref('http://example.com')).toBe('http://example.com/');
    expect(normalizeLinkHref('mailto:team@example.com')).toBe('mailto:team@example.com');
  });

  it('adds https:// to a bare host', () => {
    expect(normalizeLinkHref('example.com/docs')).toBe('https://example.com/docs');
  });

  it('rejects script and other schemes', () => {
    expect(normalizeLinkHref('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkHref('data:text/html,<b>x</b>')).toBeNull();
    expect(normalizeLinkHref('ftp://example.com')).toBeNull();
  });

  it('rejects empty and unparsable input', () => {
    expect(normalizeLinkHref('   ')).toBeNull();
    expect(normalizeLinkHref('http://')).toBeNull();
  });
});
