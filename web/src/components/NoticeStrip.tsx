import { ChevronDown, ChevronUp, Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { useMarkNotices, useNotices } from '@/components/NoticeBanners';
import { noticeHeadline } from '@/lib/api';
import { timeAgo } from '@/lib/time';

/**
 * Home: one line while there's a new notice that isn't already a banner (its banner ended or
 * was never shown), nothing otherwise. Tap to expand (that marks them read) and tap a notice
 * for its full text; ✕ clears them.
 */
export function NoticeStrip() {
  const list = useNotices();
  const mark = useMarkNotices();
  // While open, the ones it opened with (they're read now, so the query no longer counts them).
  const [shown, setShown] = useState<string[] | null>(null);
  const [showing, setShowing] = useState<string | null>(null);

  const all = list.data ?? [];
  const fresh = all.filter((n) => !n.read && !n.banner && !n.dismissed);
  const notices = shown ? all.filter((n) => shown.includes(n.id)) : fresh;
  if (!notices.length) return null;
  const newest = notices[0]!;

  const expand = () => {
    if (shown) {
      setShown(null);
      return;
    }
    setShown(notices.map((n) => n.id));
    mark.mutate({ how: 'read', ids: notices.map((n) => n.id) });
  };
  const dismiss = () => {
    mark.mutate({ how: 'dismiss', ids: notices.map((n) => n.id) });
    setShown([]);
  };

  return (
    <section aria-label="New notices" className="rounded-xl border bg-card shadow-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={expand}
          aria-expanded={!!shown}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          <Megaphone className="size-4 shrink-0 text-primary" aria-hidden />
          {shown ? (
            <span className="font-medium">New notices</span>
          ) : (
            <>
              <span className="shrink-0 text-muted-foreground">New notice:</span>
              <span className="truncate font-medium">{noticeHeadline(newest)}</span>
              {notices.length > 1 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  +{notices.length - 1} more
                </span>
              )}
            </>
          )}
          {shown ? (
            <ChevronUp className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Clear new notices"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>
      {shown && (
        <ul className="divide-y border-t px-3">
          {notices.map((n) => (
            <li key={n.id} className="py-2">
              <button
                type="button"
                className="flex w-full items-start gap-1.5 text-left text-sm"
                onClick={() => setShowing(showing === n.id ? null : n.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{noticeHeadline(n)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {n.to} · {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
              {showing === n.id && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {n.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
