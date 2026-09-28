import { fileExtension } from './upload-rules';

export type FileKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'text' | 'csv' | 'archive' | 'other';

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  txt: 'text',
  csv: 'csv',
  zip: 'archive',
};

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint',
  image: 'Imagen',
  text: 'Texto',
  csv: 'CSV',
  archive: 'ZIP',
  other: 'Archivo',
};

/** The API derives `mimeType` from the extension, so the extension is the reliable key for a label. */
export function fileKindOf(fileName: string): FileKind {
  return BY_EXTENSION[fileExtension(fileName)] ?? 'other';
}
