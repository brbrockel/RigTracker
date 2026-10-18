import { Link } from 'react-router';
import { csvDate } from '@/components/inventory/csv';
import { timeOf } from '@/components/inventory/sort';
import type { ColumnDef, GroupOption, ItemSummary, SortOption } from '@/components/inventory/types';
import { RepackBadge, repackState } from '@/components/rigs/RepackBadge';
import { Thumb } from '@/components/Thumb';
import { formatDate, mediaUrl, parseDate, rigLabel, type Rig } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Looks up the primary person's name. */
export type NameOf = (id?: string) => string | undefined;

const join = (...parts: (string | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' · ');
const withSerial = (what?: string, serial?: string) => join(what, serial && `S/N ${serial}`);

function TwoLine({ main, sub }: { main?: string; sub?: string }) {
  if (!main && !sub) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col">
      <span>{main || '—'}</span>
      {sub && <span className="text-xs text-muted-foreground">S/N {sub}</span>}
    </div>
  );
}

const dateCell = (value?: string) =>
  formatDate(value) || <span className="text-muted-foreground">—</span>;

const repackClass = {
  overdue: 'font-medium text-destructive',
  soon: 'font-medium text-amber-700 dark:text-amber-400',
  ok: '',
  none: 'text-muted-foreground',
};

export function rigColumns(nameOf: NameOf): ColumnDef<Rig>[] {
  const person = (r: Rig) => (r.primaryUserId ? nameOf(r.primaryUserId) || 'Unknown person' : '');
  return [
    {
      id: 'photo',
      label: 'Photo',
      render: (r) => <Thumb url={r.imageUrl} alt={rigLabel(r)} className="size-10 rounded-md" />,
      text: (r) => mediaUrl(r.imageUrl) ?? '',
      className: 'w-14',
    },
    {
      id: 'rig',
      label: 'Rig',
      hideable: false,
      render: (r) => (
        <Link to={`/rigs/${r.id}`} className="font-medium hover:underline">
          {rigLabel(r)}
        </Link>
      ),
      text: rigLabel,
      sortValue: rigLabel,
      className: 'whitespace-nowrap',
    },
    {
      id: 'person',
      label: 'Primary person',
      render: (r) => person(r) || <span className="text-muted-foreground">No primary person</span>,
      text: person,
      sortValue: (r) => person(r) || null,
    },
    {
      id: 'repackDue',
      label: 'Repack due',
      render: (r) => (
        <span className={cn('whitespace-nowrap', repackClass[repackState(r)])}>
          {formatDate(r.repackDue) || '—'}
        </span>
      ),
      text: (r) => csvDate(r.repackDue),
      sortValue: (r) => timeOf(parseDate(r.repackDue)),
    },
    {
      id: 'lastPacked',
      label: 'Last packed',
      render: (r) => <span className="whitespace-nowrap">{dateCell(r.lastPacked)}</span>,
      text: (r) => csvDate(r.lastPacked),
      sortValue: (r) => timeOf(parseDate(r.lastPacked)),
    },
    {
      id: 'rigger',
      label: 'Rigger',
      render: (r) => r.riggerINT || <span className="text-muted-foreground">—</span>,
      text: (r) => r.riggerINT ?? '',
      sortValue: (r) => r.riggerINT,
    },
    {
      id: 'container',
      label: 'Container',
      render: (r) => <TwoLine main={r.container} sub={r.containerSerialNumber} />,
      text: (r) => withSerial(r.container, r.containerSerialNumber),
      sortValue: (r) => r.container,
    },
    {
      id: 'main',
      label: 'Main',
      render: (r) => <TwoLine main={r.mainSize} sub={r.mainSerialNumber} />,
      text: (r) => withSerial(r.mainSize, r.mainSerialNumber),
      sortValue: (r) => r.mainSize,
    },
    {
      id: 'reserve',
      label: 'Reserve',
      render: (r) => <TwoLine main={r.reserveSize} sub={r.reserveSerialNumber} />,
      text: (r) => withSerial(r.reserveSize, r.reserveSerialNumber),
      sortValue: (r) => r.reserveSize,
    },
    {
      id: 'aad',
      label: 'AAD',
      render: (r) => <TwoLine main={r.aadType} sub={r.aadSerialNumber} />,
      text: (r) => withSerial(r.aadType, r.aadSerialNumber),
      sortValue: (r) => r.aadType,
    },
    {
      id: 'notes',
      label: 'Notes',
      defaultVisible: false,
      render: (r) => <span className="line-clamp-2 max-w-xs text-muted-foreground">{r.notes}</span>,
      text: (r) => r.notes ?? '',
      sortValue: (r) => r.notes,
    },
    {
      id: 'updated',
      label: 'Updated',
      defaultVisible: false,
      render: (r) => <span className="whitespace-nowrap">{dateCell(r.updatedAt)}</span>,
      text: (r) => csvDate(r.updatedAt),
      sortValue: (r) => timeOf(parseDate(r.updatedAt)),
    },
  ];
}

export function rigSorts(nameOf: NameOf): SortOption<Rig>[] {
  return [
    { id: 'number', label: 'Rig number', value: (r) => r.number?.trim() },
    { id: 'name', label: 'Name', value: (r) => r.name?.trim() },
    { id: 'repackDue', label: 'Repack due', value: (r) => timeOf(parseDate(r.repackDue)) },
    {
      id: 'person',
      label: 'Primary person',
      value: (r) => (r.primaryUserId ? nameOf(r.primaryUserId) : undefined),
    },
    {
      id: 'updated',
      label: 'Recently changed',
      value: (r) => timeOf(parseDate(r.updatedAt)),
      defaultDir: 'desc',
    },
  ];
}

const repackGroups = {
  overdue: { key: 'overdue', label: 'Overdue', rank: 0 },
  soon: { key: 'soon', label: 'Due in 30 days', rank: 1 },
  ok: { key: 'ok', label: 'In date', rank: 2 },
  none: { key: 'none', label: 'No date', rank: 3 },
};

export function rigGroups(nameOf: NameOf): GroupOption<Rig>[] {
  return [
    { id: 'repack', label: 'Repack status', of: (r) => repackGroups[repackState(r)] },
    {
      id: 'person',
      label: 'Primary person',
      of: (r) =>
        r.primaryUserId
          ? { key: r.primaryUserId, label: nameOf(r.primaryUserId) || 'Unknown person' }
          : { key: '', label: 'No primary person', rank: 1 },
    },
  ];
}

export function rigSummary(r: Rig, nameOf: NameOf): ItemSummary {
  return {
    title: rigLabel(r),
    href: `/rigs/${r.id}`,
    subtitle: join(
      r.primaryUserId ? nameOf(r.primaryUserId) || 'Unknown person' : 'No primary person',
      r.container,
    ),
    imageUrl: r.imageUrl,
    badges: repackState(r) === 'none' ? undefined : <RepackBadge rig={r} />,
  };
}
