import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api, errorMessage, type AuditEntry, type AuditPage } from '@/lib/api';
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
] as const;

const ACTIONS = [
  ['', 'All actions'],
  ['CREATE', 'Added'],
  ['UPDATE', 'Changed'],
  ['DELETE', 'Deleted'],
  ['SIGN_IN', 'Signed in'],
  ['SIGN_OUT', 'Signed out'],
  ['SIGN_IN_LINK', 'Sign-in links'],
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
      return `changed ${noun}${name}`;
    case 'DELETE':
      return name ? `deleted ${noun}${name}` : `deleted ${noun === 'gear' ? 'gear' : `a ${noun}`}`;
    case 'SIGN_IN':
      return 'signed in';
    case 'SIGN_OUT':
      return e.details?.everywhere
        ? `signed${name || ' someone'} out everywhere`
        : 'signed out';
    case 'SIGN_IN_LINK':
      return `made a sign-in link for${name || ' someone'}`;
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
            <ActivityRow key={e._id} entry={e} />
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

function ActivityRow({ entry: e }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const who = e.userDisplayName || e.userEmail || 'Command line';
  const hasDetails = !!e.details && Object.keys(e.details).length > 0;
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
      {open && hasDetails && (
        <div className="mt-2 max-h-60 overflow-x-auto overflow-y-auto rounded-md bg-muted">
          <pre className="p-2 text-xs">{JSON.stringify(e.details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
