import { InstallHint } from '@/components/InstallHint';
import { CalendarDays, ChevronRight, Package, Plus, Users, Wrench } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/auth/session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { canWrite, daysUntil, errorMessage, formatDate, rigLabel, type Rig } from '@/lib/api';
import { useEvents, useGear, usePeople, useRigs } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Rigs whose reserve repack is past due or due within this many days are listed on Home. */
const DUE_SOON_DAYS = 30;

export function HomePage() {
  const user = useUser();
  const rigs = useRigs();
  const events = useEvents();
  const gear = useGear();
  const people = usePeople();
  const firstName = user?.displayName?.split(' ')[0];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstName ? `Hi, ${firstName}` : 'Welcome'}
        </h1>
        <p className="text-sm text-muted-foreground">Repacks coming up and what's on next.</p>
      </div>

      <InstallHint />

      <div className="grid gap-5 md:grid-cols-2">
        <RepacksCard rigs={rigs.data} pending={rigs.isPending} error={rigs.error} />
        <UpcomingEventsCard />
      </div>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat to="/rigs" label="Rigs" icon={Wrench} count={rigs.data?.length} />
        <Stat to="/gear" label="Gear" icon={Package} count={gear.data?.length} />
        <Stat to="/people" label="People" icon={Users} count={people.data?.length} />
        <Stat to="/events" label="Events" icon={CalendarDays} count={events.data?.length} />
      </section>

      {canWrite(user) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Quick add</h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/rigs">
                <Plus /> New rig
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/gear">
                <Plus /> New gear
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/people">
                <Plus /> New person
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/events">
                <Plus /> New event
              </Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function RepacksCard({
  rigs,
  pending,
  error,
}: {
  rigs?: Rig[];
  pending: boolean;
  error: Error | null;
}) {
  const due = (rigs ?? [])
    .map((rig) => ({ rig, days: daysUntil(rig.repackDue) }))
    .filter((r): r is { rig: Rig; days: number } => r.days !== null && r.days <= DUE_SOON_DAYS)
    .sort((a, b) => a.days - b.days);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repacks</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">{errorMessage(error)}</Alert>
        ) : pending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : due.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All rigs are in date. Nothing due in the next {DUE_SOON_DAYS} days.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {due.map(({ rig, days }) => (
              <li key={rig.id}>
                <Link
                  to={`/rigs/${rig.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{rigLabel(rig)}</div>
                    <div className="text-xs text-muted-foreground">
                      Repack due {formatDate(rig.repackDue)}
                      {rig.lastPacked && ` · packed ${formatDate(rig.lastPacked)}`}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      days < 0
                        ? 'bg-destructive/15 text-destructive'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {days < 0
                      ? `Overdue ${-days} ${-days === 1 ? 'day' : 'days'}`
                      : days === 0
                        ? 'Due today'
                        : `Due in ${days} ${days === 1 ? 'day' : 'days'}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingEventsCard() {
  const events = useEvents();
  const upcoming = (events.data ?? [])
    .map((event) => ({ event, days: daysUntil(event.eventDate) }))
    .filter((e) => e.days !== null && e.days >= 0)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Upcoming events</CardTitle>
        <Link to="/events" className="text-sm font-medium text-primary hover:underline">
          See all events
        </Link>
      </CardHeader>
      <CardContent>
        {events.isError ? (
          <Alert variant="destructive">{errorMessage(events.error)}</Alert>
        ) : events.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events coming up.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {upcoming.map(({ event, days }) => (
              <li key={event.id}>
                <Link
                  to={`/events/${event.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                >
                  <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{event.name || 'Untitled event'}</div>
                    <div className="text-xs text-muted-foreground">
                      {days === 0 ? 'Today' : formatDate(event.eventDate)}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  to,
  label,
  icon: Icon,
  count,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  count?: number;
}) {
  return (
    <Link to={to} className="group" aria-label={`${label}: ${count ?? 'loading'}`}>
      <Card className="flex items-center gap-3 p-4 transition-colors group-hover:bg-accent/50">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
        <div className="flex flex-col">
          <span className="text-xl font-semibold tabular-nums">{count ?? '–'}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </Card>
    </Link>
  );
}
