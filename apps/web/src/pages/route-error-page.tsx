import { Link, useRouteError } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStaleChunkError } from '@/routes/stale-chunk';

/**
 * Rendered by the router when a screen fails to load or crashes. After a
 * deploy, an open tab may request a code chunk that no longer exists; that
 * needs a reload, which is the one thing to offer. No stack trace is shown
 * (docs/UI-UX.md "Error").
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const stale = isStaleChunkError(error);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{stale ? 'Hay una versión nueva de la aplicación' : 'No se pudo mostrar esta pantalla'}</h1>
        <p className="text-sm text-muted-foreground">
          {stale
            ? 'Recarga la página para continuar con la versión más reciente.'
            : 'Ocurrió un error inesperado. Recarga la página o vuelve al inicio.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>
          <RefreshCw /> Recargar
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
