import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api, errorMessage, isVideo, type AuditEntry, type AuditPage } from '@/lib/api';
import { keys } from '@/lib/queries';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

/** Resource strings as each API controller logs them. */
const RESOURCES = [
  ['', 'Everything'],
  ['rigs', 'Rigs'],
  ['gear', 'Gear'],
  ['people', 'People'],
  ['events', 'Events'],
  ['user', 'Accounts and sign-in'],
  ['guests', 'Guests'],
] as const;

const ACTIONS = [
  ['', 'All actions'],
  ['CREATE', 'Added'],
  ['UPDATE', 'Changed'],
  ['DELETE', 'Deleted'],
  ['SIGN_IN', 'Signed in'],
  ['SIGN_OUT', 'Signed out'],
  ['SIGN_IN_FAILED', 'Failed sign-ins'],
  ['LOCKOUT', 'Lockouts'],
  ['UNLOCK', 'Unlocks'],
  ['SIGN_IN_LINK', 'Password links'],
  ['PASSWORD_SET', 'Passwords set'],
  ['PASSWORD_CHANGE', 'Passwords changed'],
  ['TOTP_ON', 'Authenticator on'],
  ['TOTP_OFF', 'Authenticator off'],
  ['TOTP_RESET', 'Authenticator reset'],
  ['RECOVERY_CODES', 'New recovery codes'],
  ['GUEST_SIGN_IN', 'Guests'],
] as const;

const NOUNS: Record<string, string> = {
  rigs: 'rig',
  gear: 'gear',
  people: 'person',
  events: 'event',
  user: 'account',
};

/** A plain-English description of what was done, e.g. "added gear Foo". */
function describe(e: AuditEntry): string {
  const noun = NOUNS[e.resource] ?? e.resource;
  const name = e.resourceName ? ` ${e.resourceName}` : '';
  const role = typeof e.details?.role === 'string' ? e.details.role : null;
  switch (e.action) {
    case 'CREATE':
      return e.resource === 'user' ? `added${name || ' an account'}` : `added ${noun}${name}`;
    case 'UPDATE':
      if (e.resource === 'user' && role)
        return `made${name || ' someone'} ${role === 'admin' ? 'an admin' : 'a user'}`;
      if (typeof e.details?.media === 'string') {
        const url = typeof e.details.url === 'string' ? e.details.url : '';
        const what = isVideo(url) ? 'a video' : 'a photo';
        if (e.details.media === 'added') return `added ${what} to ${noun}${name}`;
        if (e.details.media === 'removed') return `removed ${what} from ${noun}${name}`;
        if (e.details.media === 'cover') return `changed the cover of ${noun}${name}`;
        if (e.details.media === 'caption') return `changed a caption on ${noun}${name}`;
      }
      return `changed ${noun}${name}`;
    case 'DELETE':
      return name ? `deleted ${noun}${name}` : `deleted ${noun === 'gear' ? 'gear' : `a ${noun}`}`;
    case 'SIGN_IN':
      return e.details?.method === 'code'
        ? 'signed in with an authenticator code'
        : e.details?.method === 'link'
          ? 'signed in with a password link'
          : 'signed in';
    case 'SIGN_IN_FAILED': {
      const who = name || (typeof e.details?.email === 'string' ? ` ${e.details.email}` : '');
      const why = typeof e.details?.reason === 'string' ? ` (${e.details.reason})` : '';
      return `failed to sign in as${who || ' someone'}${why}`;
    }
    case 'LOCKOUT': {
      const minutes = typeof e.details?.minutes === 'number' ? e.details.minutes : null;
      return `locked${name || ' someone'} out${minutes ? ` for ${minutes} minutes` : ''} after too many wrong tries`;
    }
    case 'UNLOCK':
      return `unlocked${name || ' someone'}`;
    case 'PASSWORD_SET':
      return e.details?.via === 'link' ? 'set a password with a password link' : 'set a password';
    case 'PASSWORD_CHANGE':
      return 'changed their password';
    case 'TOTP_ON':
      return 'turned on authenticator codes';
    case 'TOTP_OFF':
      return 'turned off authenticator codes';
    case 'TOTP_RESET':
      return `reset the authenticator of${name || ' someone'}`;
    case 'RECOVERY_CODES':
      return 'made new recovery codes';
    case 'GUEST_SIGN_IN':
      return 'looked around as a guest';
    case 'SIGN_OUT':
      return e.details?.everywhere ? `signed${name || ' someone'} out everywhere` : 'signed out';
    case 'SIGN_IN_LINK':
      return `made a password link for${name || ' someone'}`;
    default:
      return `${e.action.toLowerCase()} ${noun}${name}`;
  }
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function timeAgo(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatDateTime(value);
}

export function ActivityPage() {
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');

  const query = useInfiniteQuery({
    queryKey: [...keys.audit, resource, action],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<AuditPage>(
        `/audit?${new URLSearchParams({
          ...(resource ? { resource } : {}),
          ...(action ? { action } : {}),
          page: String(pageParam),
          limit: String(PAGE_SIZE),
        })}`,
      ),
    getNextPageParam: (last, pages) =>
      pages.reduce((n, p) => n + p.logs.length, 0) < last.total && last.logs.length > 0
        ? pages.length + 1
        : undefined,
  });
  const entries = query.data?.pages.flatMap((p) => p.logs) ?? [];
  const total = query.data?.pages[0]?.total;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Activity log"
        subtitle="Who added, changed or deleted what, and every sign-in. Newest first."
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="Filter by record type"
          className="sm:w-60"
          value={resource}
          onChange={(e) => setResource(e.target.value)}
        >
          {RESOURCES.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by action"
          className="sm:w-48"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {ACTIONS.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </Select>
      </div>

      {query.isError && <Alert variant="destructive">{errorMessage(query.error)}</Alert>}
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        !query.isError && <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <Card className="divide-y p-0">
          {entries.map((e) => (
            <ActivityRow key={e.id} entry={e} />
          ))}
        </Card>
      )}

      {query.hasNextPage && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
          {total !== undefined && (
            <span className="text-xs text-muted-foreground">
              Showing {entries.length} of {total}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Fields that aren't worth showing in a change list. */
const IGNORED = new Set(['id', 'createdAt', 'updatedAt', 'legacyId']);

/** The fields an update changed, with their old and new values. */
export function changedFields(e: Pick<AuditEntry, 'before' | 'after'>) {
  if (!e.before || !e.after) return [];
  const keys = new Set([...Object.keys(e.before), ...Object.keys(e.after)]);
  const show = (v: unknown) =>
    v === null || v === undefined || v === ''
      ? '—'
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);
  return [...keys]
    .filter(
      (k) =>
        !IGNORED.has(k) &&
        JSON.stringify(e.before![k] ?? null) !== JSON.stringify(e.after![k] ?? null),
    )
    .map((k) => ({ field: k, from: show(e.before![k]), to: show(e.after![k]) }));
}

/** camelCase field name → "Camel case". */
const label = (k: string) => {
  const words = k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function ActivityRow({ entry: e }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const who =
    e.userDisplayName ||
    e.userEmail ||
    (e.action === 'GUEST_SIGN_IN'
      ? 'A guest'
      : e.action === 'SIGN_IN_FAILED'
        ? 'Someone'
        : e.action === 'LOCKOUT'
          ? 'RigTracker'
          : 'Command line');
  const changes = changedFields(e);
  const hasDetails = (!!e.details && Object.keys(e.details).length > 0) || changes.length > 0;
  const summary = (
    <div className="min-w-0 flex-1">
      <div className="break-words">
        <span className="font-medium">{who}</span> {describe(e)}
      </div>
      <time
        dateTime={e.createdAt}
        title={formatDateTime(e.createdAt)}
        className="text-xs text-muted-foreground"
      >
        {timeAgo(e.createdAt)}
      </time>
    </div>
  );

  return (
    <div className="px-4 py-3 text-sm">
      {hasDetails ? (
        <button
          type="button"
          className="flex min-h-11 w-full items-start gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {summary}
          <ChevronDown
            className={cn(
              'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
      ) : (
        <div className="flex min-h-11 items-start gap-2">{summary}</div>
      )}
      {open && changes.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted p-2 text-xs">
          {changes.map((c) => (
            <div key={c.field} className="contents">
              <dt className="font-medium">{label(c.field)}</dt>
              <dd className="min-w-0 break-words">
                <span className="text-muted-foreground line-through">{c.from}</span> → {c.to}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {open && !!e.details && Object.keys(e.details).length > 0 && (
        <div className="mt-2 max-h-60 overflow-x-auto overflow-y-auto rounded-md bg-muted">
          <pre className="p-2 text-xs">{JSON.stringify(e.details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
