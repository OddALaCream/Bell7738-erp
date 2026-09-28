import { useState } from 'react';
import { AlertTriangle, Check, Copy, ShieldOff, RotateCw } from 'lucide-react';
import { ApiError } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** docs/UI-UX.md "Error": human message + copyable requestId + retry for transient failures. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const isApiError = error instanceof ApiError;
  const requestId = isApiError ? error.requestId : undefined;
  const message = isApiError ? humanMessage(error) : 'No se pudo completar la operación.';

  async function copyRequestId() {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently (permissions, insecure context); not critical.
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{message}</p>
      {requestId && (
        <button
          type="button"
          onClick={copyRequestId}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          ID de referencia: {requestId}
        </button>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Reintentar
        </Button>
      )}
    </div>
  );
}

function humanMessage(error: ApiError): string {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return 'Revisa los datos ingresados e inténtalo nuevamente.';
    case 'RATE_LIMITED':
      return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
    case 'INTERNAL_ERROR':
      return 'Ocurrió un error inesperado en el servidor.';
    case 'NETWORK_ERROR':
      return 'No se pudo conectar con el servidor. Verifica tu conexión.';
    default:
      return error.message || 'No se pudo completar la operación.';
  }
}

export function ForbiddenState({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      <ShieldOff className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">No tienes permiso para ver esto</p>
        <p className="text-sm text-muted-foreground">
          Si crees que deberías tener acceso, contacta a un administrador.
        </p>
      </div>
    </div>
  );
}

export function NotFoundState({ title = 'No se encontró', className }: { title?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
    </div>
  );
}
