import { CloudOff, RotateCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConnectionStatus } from './use-connection-status';

/** Sticky strip under the header; renders nothing while everything is reachable. */
export function ConnectionBanner() {
  const { online, apiUnreachable, retry } = useConnectionStatus();
  if (online && !apiUnreachable) return null;

  const Icon = online ? CloudOff : WifiOff;
  return (
    <div
      role="status"
      className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-warning bg-warning/15 px-4 py-2 text-sm"
    >
      <p className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {online
          ? 'No se puede contactar con el servidor. Lo que ves puede no estar actualizado.'
          : 'Sin conexión a internet. Lo que ves puede no estar actualizado y los cambios no se guardarán.'}
      </p>
      {online && (
        <Button size="sm" variant="outline" onClick={retry}>
          <RotateCw /> Reintentar
        </Button>
      )}
    </div>
  );
}
