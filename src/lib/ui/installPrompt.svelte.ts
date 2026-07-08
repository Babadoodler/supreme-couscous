// Deferred install prompt (DESIGN.md §8): no nagging — a subtle hint in the
// library header, only from the second session onwards.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installState = $state<{ available: boolean }>({ available: false });

let deferred: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    installState.available = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installState.available = false;
  });
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  installState.available = false;
}
