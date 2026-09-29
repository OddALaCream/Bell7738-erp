import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, label = 'Cargando' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 className={cn('size-4 animate-spin text-muted-foreground', className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
