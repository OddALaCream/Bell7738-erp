import { useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, CheckCircle2, RotateCw, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { UploadItem } from './use-document-uploads';
import { useUploadRules } from './use-upload-rules';

const LIMITS_ID = 'upload-limits';

/**
 * Drop zone + per-file progress (docs/UI-UX.md "Documentos"). The visible
 * button is the accessible way in; dragging is an extra. Limits are shown
 * before sending, and a file only reads "Subido" once the API confirmed it.
 */
export function UploadPanel({
  items,
  onAddFiles,
  onRetry,
  onDismiss,
  onDismissMany,
}: {
  items: UploadItem[];
  onAddFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onDismissMany: (ids: string[]) => void;
}) {
  const rules = useUploadRules();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) onAddFiles(dropped);
  }

  const finished = items.filter((item) => item.status !== 'uploading');

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors',
          dragging && 'border-primary bg-accent',
        )}
      >
        <UploadCloud className="size-7 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">Arrastra archivos aquí o</p>
        <Button type="button" variant="outline" size="sm" aria-describedby={LIMITS_ID} onClick={() => inputRef.current?.click()}>
          Seleccionar archivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          accept={rules.extensions.map((extension) => `.${extension}`).join(',')}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            // Reset so choosing the same file again still fires `change`.
            event.target.value = '';
            if (selected.length > 0) onAddFiles(selected);
          }}
        />
        <p id={LIMITS_ID} className="text-xs text-muted-foreground">
          Máximo {formatBytes(rules.maxBytes)} por archivo. Tipos permitidos:{' '}
          {rules.extensions.map((extension) => extension.toUpperCase()).join(', ')}.
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <ul aria-live="polite" className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center gap-2">
                  {item.status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden="true" />}
                  {item.status === 'error' && <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.size)}</span>
                  {item.status !== 'uploading' && (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${item.name} de la lista`} onClick={() => onDismiss(item.id)}>
                      <X />
                    </Button>
                  )}
                </div>
                {item.status === 'uploading' && (
                  <div className="flex items-center gap-2">
                    <Progress value={item.progress} aria-label={`Subiendo ${item.name}`} />
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{item.progress}%</span>
                  </div>
                )}
                {item.status === 'done' && <p className="text-xs text-muted-foreground">Subido.</p>}
                {item.status === 'error' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p role="alert" className="text-xs text-destructive">
                      {item.error}
                    </p>
                    {item.retryable && (
                      <Button type="button" variant="outline" size="sm" onClick={() => onRetry(item.id)}>
                        <RotateCw /> Reintentar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {finished.length > 1 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onDismissMany(finished.map((item) => item.id))}>
              Limpiar lista
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
