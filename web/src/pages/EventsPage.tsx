import { CalendarPlus, ChevronDown, Images } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useUser } from '@/auth/session';
import { EventDialog } from '@/components/events/EventDialog';
import { PageHeader } from '@/components/PageHeader';
import { Thumb } from '@/components/Thumb';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { canWrite, daysUntil, errorMessage, formatDate, type RigEvent } from '@/lib/api';
import { useEvents } from '@/lib/queries';

const time = (e: RigEvent) => (e.eventDate ? new Date(e.eventDate).getTime() || 0 : 0);

function monthLabel(e: RigEvent): string {
  if (!e.eventDate) return 'No date';
  const d = new Date(e.eventDate);
  if (Number.isNaN(d.getTime())) return 'No date';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Consecutive events of the same month, in the order given. */
function byMonth(events: RigEvent[]) {
  const groups: { label: string; events: RigEvent[] }[] = [];
  for (const e of events) {
    const label = monthLabel(e);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.events.push(e);
    else groups.push({ label, events: [e] });
  }
  return groups;
}

export function EventsPage() {
  const user = useUser();
  const navigate = useNavigate();
  const events = useEvents();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const { upcoming, past } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = (events.data ?? []).filter(
      (e) =>
        !q || e.name?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q),
    );
    const isPast = (e: RigEvent) => (daysUntil(e.eventDate) ?? 0) < 0;
    return {
      // Soonest first; undated events sit with the upcoming ones, at the end.
      upcoming: shown
        .filter((e) => !isPast(e))
        .sort((a, b) => (time(a) || Infinity) - (time(b) || Infinity)),
      // Most recent first.
      past: shown.filter(isPast).sort((a, b) => time(b) - time(a)),
    };
  }, [events.data, search]);

  // Past events open by default when there's nothing coming up, or while searching.
  const pastOpen = showPast || upcoming.length === 0 || !!search.trim();
  const none = events.data && upcoming.length === 0 && past.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Events"
        subtitle="Boogies, trips and jump days, with their photos."
        action={
          canWrite(user) && (
            <Button onClick={() => setCreating(true)}>
              <CalendarPlus /> New event
            </Button>
          )
        }
      />

      <Input
        aria-label="Search events"
        placeholder="Search by name or description"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {events.isError && <Alert variant="destructive">{errorMessage(events.error)}</Alert>}
      {events.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {none && (
        <p className="text-sm text-muted-foreground">
          {events.data.length === 0 ? 'No events yet.' : 'No events match.'}
        </p>
      )}

      {upcoming.length > 0 && (
        <section aria-label="Upcoming" className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming
          </h2>
          <MonthGroups events={upcoming} />
        </section>
      )}

      {past.length > 0 && (
        <section aria-label="Past" className="flex flex-col gap-4">
          {upcoming.length > 0 && !search.trim() ? (
            <button
              type="button"
              className="flex min-h-11 items-center gap-1 self-start text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              aria-expanded={pastOpen}
              onClick={() => setShowPast((v) => !v)}
            >
              Past ({past.length})
              <ChevronDown
                className={`size-4 transition-transform ${pastOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          ) : (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Past
            </h2>
          )}
          {pastOpen && <MonthGroups events={past} />}
        </section>
      )}

      {creating && (
        <EventDialog
          onClose={() => setCreating(false)}
          onSaved={(e) => navigate(`/events/${e._id}`)}
        />
      )}
    </div>
  );
}

function MonthGroups({ events }: { events: RigEvent[] }) {
  return byMonth(events).map((g) => (
    <div key={g.label} className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">{g.label}</h3>
      <ul className="flex flex-col gap-2">
        {g.events.map((e) => (
          <li key={e._id}>
            <EventCard event={e} />
          </li>
        ))}
      </ul>
    </div>
  ));
}

function EventCard({ event: e }: { event: RigEvent }) {
  const count = new Set([...(e.photoUrls ?? []), ...(e.eventPhotoUrl ? [e.eventPhotoUrl] : [])])
    .size;
  return (
    <Card className="transition-colors hover:bg-accent/50">
      <Link to={`/events/${e._id}`} className="flex items-center gap-3 p-3">
        <Thumb url={e.eventPhotoUrl || e.photoUrls?.[0]} alt={e.name || 'Event'} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{e.name || 'Untitled event'}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{formatDate(e.eventDate) || 'No date'}</span>
            {count > 0 && (
              <span className="inline-flex items-center gap-1">
                · <Images className="size-3.5" aria-hidden /> {count}{' '}
                {count === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}
