import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { useInstallPrompt } from './use-install-prompt';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker (once, app-wide) and surfaces the two PWA
 * moments docs/UI-UX.md asks to keep out of the way:
 * - a new version is ready: the user chooses when to reload, so a form in
 *   progress is never discarded by an automatic refresh;
 * - the browser offers installation: a small card that can be dismissed.
 * Neither blocks anything, and the app works identically without them.
 */
export function PwaPrompts() {
  const { status } = useAuth();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // A long-lived installed app never navigates "fresh", so look for updates periodically.
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });
  const install = useInstallPrompt();

  const showUpdate = needRefresh && !updateDismissed;
  const showInstall = status === 'authenticated' && install.canInstall;
  if (!showUpdate && !showInstall) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96 lg:bottom-4">
      {showUpdate && (
        <div role="status" className="space-y-3 rounded-lg border border-border bg-popover p-4 text-sm shadow-lg">
          <p className="font-medium">Hay una nueva versión disponible</p>
          <p className="text-muted-foreground">
            Termina lo que estás haciendo y recarga cuando quieras; no se recargará por sí sola.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setUpdateDismissed(true)}>
              Más tarde
            </Button>
            <Button size="sm" onClick={() => void updateServiceWorker(true)}>
              <RefreshCw /> Recargar ahora
            </Button>
          </div>
        </div>
      )}
      {showInstall && (
        <section aria-label="Instalar la aplicación" className="space-y-3 rounded-lg border border-border bg-popover p-4 text-sm shadow-lg">
          <p className="font-medium">Instala Startup ERP</p>
          <p className="text-muted-foreground">Ábrela como una aplicación, con su propio icono y sin la barra del navegador.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={install.dismiss}>
              Ahora no
            </Button>
            <Button size="sm" onClick={() => void install.install()}>
              <Download /> Instalar
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
