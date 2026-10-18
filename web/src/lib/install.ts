import { useSyncExternalStore } from 'react';

/** Chrome's (and Edge's, Samsung Internet's) install offer, kept for an Install button. */
export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/**
 * Listens from start-up: the browser fires beforeinstallprompt once, early, whichever page
 * the app opens on. Holding on to it stops Chrome's own mini-infobar, and lets Home offer an
 * Install button instead.
 */
export function listenForInstall(win: Window = window) {
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = e as InstallPrompt;
    changed();
  });
  win.addEventListener('appinstalled', () => {
    offer = null;
    changed();
  });
}

/** The install offer while the browser has one (installable and not installed yet). */
export function useInstallPrompt(): InstallPrompt | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offer,
  );
}

/** Shows the browser's install dialog; the offer can be used once. */
export async function install(): Promise<boolean> {
  const o = offer;
  if (!o) return false;
  offer = null;
  changed();
  await o.prompt();
  return (await o.userChoice).outcome === 'accepted';
}
