import { formatBytes } from '@/lib/format';

/** Same rule as the backend's `extensionOf`: text after the last dot, lower-cased. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export interface UploadRules {
  maxBytes: number;
  extensions: readonly string[];
}

/**
 * Early feedback before sending (docs/UI-UX.md: limits "visibles antes de
 * enviar"). Returns a user-facing reason, or null when the file looks fine.
 * The server re-validates size, extension and file signature regardless.
 */
export function validateUploadFile(file: { name: string; size: number }, rules: UploadRules): string | null {
  const extension = fileExtension(file.name);
  if (!extension || !rules.extensions.includes(extension)) {
    return extension
      ? `Los archivos .${extension} no están permitidos.`
      : 'El archivo no tiene una extensión permitida.';
  }
  if (file.size > rules.maxBytes) {
    return `Supera el máximo de ${formatBytes(rules.maxBytes)} (pesa ${formatBytes(file.size)}).`;
  }
  return null;
}
