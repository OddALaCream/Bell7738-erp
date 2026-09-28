/**
 * docs/SECURITY.md "Uploads y documentos": a conservative, fixed allowlist
 * for V1 — extensions map to a canonical server-trusted MIME type (never the
 * client-declared one) and, where a reliable one exists, a magic-byte
 * signature checked against the actual uploaded bytes. Plain text formats
 * have no universal signature, so they're allowlisted by extension only.
 */
export const EXTENSION_MIME_MAP: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

const OLE_COMPOUND_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// Legacy Office formats and OOXML/ZIP formats share one physical container
// signature each; the extension itself (already validated against the
// allowlist) is what distinguishes them semantically.
const PREFIX_SIGNATURES: Readonly<Record<string, Buffer[]>> = {
  pdf: [Buffer.from('%PDF')],
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  jpg: [Buffer.from([0xff, 0xd8, 0xff])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  gif: [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  zip: [ZIP_SIGNATURE],
  docx: [ZIP_SIGNATURE],
  xlsx: [ZIP_SIGNATURE],
  pptx: [ZIP_SIGNATURE],
  doc: [OLE_COMPOUND_SIGNATURE],
  xls: [OLE_COMPOUND_SIGNATURE],
  ppt: [OLE_COMPOUND_SIGNATURE],
};

export function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === filename.length - 1) return '';
  return filename.slice(dotIndex + 1).toLowerCase();
}

export function isAllowedExtension(
  extension: string,
  allowedExtensions: ReadonlySet<string>,
): boolean {
  return allowedExtensions.has(extension) && extension in EXTENSION_MIME_MAP;
}

/**
 * Verifies the file's actual leading bytes against its claimed extension.
 * Returns true when there's no known signature for this extension (e.g.
 * txt/csv) — those rely on the extension allowlist alone, per docs/SECURITY.md
 * "validar firma/magic bytes cuando sea posible" (only "when possible").
 */
export function matchesSignature(extension: string, head: Buffer): boolean {
  if (extension === 'webp') {
    return (
      head.length >= 12 &&
      head.subarray(0, 4).toString('ascii') === 'RIFF' &&
      head.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  const signatures = PREFIX_SIGNATURES[extension];
  if (!signatures) return true;
  return signatures.some(
    (signature) =>
      head.length >= signature.length &&
      head.subarray(0, signature.length).equals(signature),
  );
}
