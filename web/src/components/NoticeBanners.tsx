import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Megaphone, Pin, TriangleAlert, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, type Notice, type NoticeBanner } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';

export const noticesKey = ['notices'] as const;
const listKey = [...noticesKey, 'list'] as const;
const bannersKey = [...noticesKey, 'banners'] as const;

/** The notices for you (shared by the horn, its panel and the Home strip). */
export function useNotices() {
  return useQuery({
    queryKey: listKey,
    queryFn: () => api<Notice[]>('/notices?limit=50'),
  });
}

/** What shows as a banner for you: stored notices and the automatic repack reminders. */
export function useNoticeBanners() {
  return useQuery({
    queryKey: bannersKey,
    queryFn: () => api<NoticeBanner[]>('/notices/banners'),
  });
}

/** Marks notices read, or dismisses notices (ids) and automatic banners (keys). */
export function useMarkNotices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      how,
      ids,
      keys,
    }: {
      how: 'read' | 'dismiss';
      ids?: string[];
      keys?: string[];
    }) =>
      api(`/notices/${how}`, {
        method: 'POST',
        body:
          how === 'read'
            ? { ids }
            : { ...(ids?.length ? { ids } : {}), ...(keys?.length ? { keys } : {}) },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noticesKey }),
  });
}

/** Guests can't keep anything on the server: the banners they close are kept here. */
const GUEST_KEY = 'rigtracker.notices.dismissed';
export function guestDismissed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function rememberGuestDismissed(id: string) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify([...guestDismissed(), id].slice(-100)));
  } catch {
    // Private browsing: it shows again next visit.
  }
}

const tint = (urgent: boolean) =>
  urgent ? 'border-amber-500/40 bg-amber-500/10' : 'border-primary/30 bg-primary/10';

/**
 * Banners at the top of every page, most urgent first (must-see notices, overdue repacks,
 * then what's for you, then everyone's), newest first within each. With more than one they sit
 * in a stack, like a phone's notifications: the top one with a +N count and the edges of the
 * next two peeking out below; tap the stack to fan them out. Each is one line; tap for the
 * full text (that marks it read), ✕ clears it for good.
 */
export function NoticeBanners({ guest }: { guest: boolean }) {
  const query = useNoticeBanners();
  const mark = useMarkNotices();
  const [open, setOpen] = useState<string | null>(null);
  const [fanned, setFanned] = useState(false);
  const [closed, setClosed] = useState<string[]>(() => (guest ? guestDismissed() : []));

  const banners = (query.data ?? []).filter((b) => !(b.dismissible && closed.includes(b.id)));
  if (!banners.length) return null;
  const stacked = banners.length > 1 && !fanned;

  const toggle = (b: NoticeBanner) => {
    setOpen(open === b.id ? null : b.id);
    if (!b.read && !b.automatic && !guest) mark.mutate({ how: 'read', ids: [b.id] });
  };
  const dismiss = (b: NoticeBanner) => {
    setClosed((c) => [...c, b.id]);
    if (guest) rememberGuestDismissed(b.id);
    else
      mark.mutate(b.automatic ? { how: 'dismiss', keys: [b.id] } : { how: 'dismiss', ids: [b.id] });
  };

  const row = (b: NoticeBanner, extra?: React.ReactNode) => {
    const Icon = b.automatic ? (b.urgent ? TriangleAlert : Wrench) : b.urgent ? Pin : Megaphone;
    return (
      // Solid underneath so the stack's lower layers don't show through the tint.
      <div key={b.id} className="relative z-10 rounded-xl bg-background shadow-xs">
        <div
          role={b.urgent ? 'alert' : undefined}
          className={cn('rounded-xl border px-3 py-2 text-sm', tint(b.urgent))}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={open === b.id}
              onClick={() => toggle(b)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Icon
                className={cn('size-4 shrink-0', b.urgent ? 'text-amber-600' : 'text-primary')}
                aria-hidden
              />
              <span className={cn('truncate', b.read ? 'font-normal' : 'font-medium')}>
                {b.title}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{b.label}</span>
            </button>
            {extra}
            {b.dismissible ? (
              <button
                type="button"
                onClick={() => dismiss(b)}
                aria-label={`Dismiss ${b.title}`}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            ) : (
              <span className="size-6 shrink-0" aria-hidden />
            )}
          </div>
          {open === b.id && (
            <div className="mt-1 pl-6">
              {b.body && (
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{b.body}</p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {!b.automatic && <span>{timeAgo(b.createdAt)}</span>}
                {b.link && (
                  <Link
                    to={b.link}
                    className="inline-flex items-center font-medium text-primary hover:underline"
                  >
                    {b.link.startsWith('/rigs/') ? 'Open the rig' : 'See the rigs'}
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (stacked) {
    const [top, ...rest] = banners;
    const fan = () => setFanned(true);
    const peeks = rest.slice(0, 2);
    return (
      <section
        aria-label="Notices"
        className={cn('relative mb-4 print:hidden', peeks.length > 1 ? 'pb-4' : 'pb-2')}
      >
        {row(
          top!,
          <button
            type="button"
            onClick={fan}
            aria-label={`Show all ${banners.length} notices`}
            className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
          >
            +{rest.length}
          </button>,
        )}
        {/* The edges of the next ones, peeking out below; tap them to fan the stack out. */}
        {peeks.map((b, i) => (
          <button
            key={b.id}
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={fan}
            className={cn(
              'absolute inset-x-0 rounded-xl bg-background',
              i === 0 ? 'bottom-2 z-[5] mx-2 h-6' : 'bottom-0 z-0 mx-4 h-6',
            )}
          >
            <span className={cn('block h-full rounded-xl border', tint(b.urgent))} />
          </button>
        ))}
      </section>
    );
  }

  return (
    <section aria-label="Notices" className="mb-4 flex flex-col gap-1.5 print:hidden">
      {banners.map((b) => row(b))}
      {banners.length > 1 && (
        <button
          type="button"
          onClick={() => setFanned(false)}
          className="self-center rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          Show less
        </button>
      )}
    </section>
  );
}
