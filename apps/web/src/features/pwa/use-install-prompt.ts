import { useCallback, useEffect, useState } from 'react';
import { isInstallSnoozed, readInstallDismissedAt, writeInstallDismissedAt } from './install';

/** Not in lib.dom yet: Chromium's deferred install prompt. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Captures the browser's install offer so it can be shown as a discreet card
 * instead of the default mini-infobar. It only exists where the browser
 * supports installing (not Safari/Firefox desktop): elsewhere `canInstall`
 * simply stays false and nothing is shown.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [snoozed, setSnoozed] = useState(() => isInstallSnoozed(readInstallDismissedAt(), Date.now()));

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    writeInstallDismissedAt(Date.now());
    setSnoozed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    // The event can only be used once, whatever the answer.
    setDeferred(null);
    if (choice.outcome === 'dismissed') dismiss();
  }, [deferred, dismiss]);

  return { canInstall: deferred !== null && !snoozed, install, dismiss };
}
