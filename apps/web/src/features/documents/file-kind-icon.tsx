import { File, FileArchive, FileImage, FileSpreadsheet, FileText, Presentation, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileKind } from './file-kind';

const ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  image: FileImage,
  text: FileText,
  csv: FileSpreadsheet,
  archive: FileArchive,
  other: File,
};

/** Decorative: the type is always also written out as text next to it. */
export function FileKindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={cn('size-5 shrink-0 text-muted-foreground', className)} aria-hidden="true" />;
}
