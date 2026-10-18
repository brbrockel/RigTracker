import { Download, EllipsisVertical, Share, SquarePlus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { install, useInstallPrompt } from '@/lib/install';

const KEY = 'rigtracker.installHint.dismissed';

/** An Android phone or tablet. */
export const isAndroid = (nav: Navigator = navigator) => /Android/.test(nav.userAgent);

/** An iPhone or iPad (iPadOS reports itself as a Mac, but with touch). */
export function isIos(nav: Navigator = navigator): boolean {
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (nav.userAgent.includes('Macintosh') && nav.maxTouchPoints > 1)
  );
}

/** Already opened from the Home Screen icon. */
function installed(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Offers to install RigTracker as an app, until dismissed or installed:
 * - where the browser has an install offer (Chrome or Edge on Android or a computer), an
 *   Install button that opens the browser's own dialog;
 * - on an iPhone or iPad, where Safari never offers, the two taps;
 * - on Android without an offer (Chrome hasn't decided to offer yet, or another browser), the
 *   menu steps.
 */
export function InstallHint() {
  const offer = useInstallPrompt();
  const [hidden, setHidden] = useState(() => installed() || dismissed());
  if (hidden) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Private browsing: it just shows again next time.
    }
    setHidden(true);
  };
  if (offer)
    return (
      <Hint title="Install RigTracker" onClose={close}>
        <p className="text-muted-foreground">
          It opens like an app, full screen, from its own icon.
        </p>
        <Button
          size="sm"
          className="mt-2"
          onClick={() => void install().then((ok) => ok && setHidden(true))}
        >
          <Download /> Install
        </Button>
      </Hint>
    );
  if (isIos())
    return (
      <Hint title="Add RigTracker to your Home Screen" onClose={close}>
        <p className="text-muted-foreground">
          It opens like an app, full screen. In Safari, tap{' '}
          <Share className="inline size-4 align-text-bottom" aria-hidden /> Share, then{' '}
          <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> Add to Home Screen.
        </p>
      </Hint>
    );
  if (isAndroid())
    return (
      <Hint title="Add RigTracker to your Home screen" onClose={close}>
        <p className="text-muted-foreground">
          It opens like an app, full screen. In Chrome, tap{' '}
          <EllipsisVertical className="inline size-4 align-text-bottom" aria-hidden /> (top right),
          then <strong>Add to Home screen</strong> or <strong>Install app</strong>.
        </p>
      </Hint>
    );
  return null;
}

function Hint({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm shadow-xs"
    >
      <img src="/apple-touch-icon-180x180.png" alt="" className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Don't show again"
        className="rounded-md p-1 text-muted-foreground hover:bg-accent"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
