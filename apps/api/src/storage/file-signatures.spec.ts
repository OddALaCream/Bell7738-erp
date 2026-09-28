import {
  EXTENSION_MIME_MAP,
  extensionOf,
  isAllowedExtension,
  matchesSignature,
} from './file-signatures.js';

describe('extensionOf', () => {
  it('extracts a lowercase extension', () => {
    expect(extensionOf('Report.PDF')).toBe('pdf');
  });

  it('returns an empty string when there is no extension', () => {
    expect(extensionOf('README')).toBe('');
  });

  it('returns an empty string when the dot is the last character', () => {
    expect(extensionOf('file.')).toBe('');
  });

  it('uses only the final segment for a multi-dot filename', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });
});

describe('isAllowedExtension', () => {
  const allowed = new Set(['pdf', 'png']);

  it('allows an extension present in both the allowlist and the MIME map', () => {
    expect(isAllowedExtension('pdf', allowed)).toBe(true);
  });

  it('rejects an extension not in the configured allowlist', () => {
    expect(isAllowedExtension('exe', allowed)).toBe(false);
  });

  it('rejects an extension that is allowlisted but unknown to the MIME map', () => {
    const unknownAllowed = new Set(['exe']);
    expect(isAllowedExtension('exe', unknownAllowed)).toBe(false);
  });
});

describe('matchesSignature', () => {
  it('confirms a PDF signature', () => {
    expect(matchesSignature('pdf', Buffer.from('%PDF-1.7 rest of file'))).toBe(
      true,
    );
  });

  it('rejects a mismatched signature for a known-signature extension', () => {
    expect(matchesSignature('pdf', Buffer.from('not a pdf'))).toBe(false);
  });

  it('confirms a PNG signature', () => {
    expect(
      matchesSignature(
        'png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
      ),
    ).toBe(true);
  });

  it('confirms a JPEG signature', () => {
    expect(matchesSignature('jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      true,
    );
  });

  it('confirms a ZIP-container signature shared by docx/xlsx/pptx/zip', () => {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(matchesSignature('docx', zipHeader)).toBe(true);
    expect(matchesSignature('xlsx', zipHeader)).toBe(true);
    expect(matchesSignature('zip', zipHeader)).toBe(true);
  });

  it('confirms the legacy OLE compound signature shared by doc/xls/ppt', () => {
    const oleHeader = Buffer.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ]);
    expect(matchesSignature('doc', oleHeader)).toBe(true);
    expect(matchesSignature('xls', oleHeader)).toBe(true);
  });

  it('confirms a WEBP signature via its RIFF/WEBP special case', () => {
    const header = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP'),
    ]);
    expect(matchesSignature('webp', header)).toBe(true);
  });

  it('rejects a RIFF header that is not actually WEBP', () => {
    const header = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WAVE'),
    ]);
    expect(matchesSignature('webp', header)).toBe(false);
  });

  it('has no signature to check for extensions with no universal magic bytes (allows by default)', () => {
    expect(matchesSignature('txt', Buffer.from('anything at all'))).toBe(true);
    expect(matchesSignature('csv', Buffer.from('a,b,c'))).toBe(true);
  });

  it('rejects when the buffer is shorter than the expected signature', () => {
    expect(matchesSignature('pdf', Buffer.from('%P'))).toBe(false);
  });
});

describe('EXTENSION_MIME_MAP', () => {
  it('covers every extension used by the signature checks', () => {
    for (const extension of [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'txt',
      'csv',
      'zip',
    ]) {
      expect(EXTENSION_MIME_MAP[extension]).toBeDefined();
    }
  });
});
