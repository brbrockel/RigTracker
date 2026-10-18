import { Link } from 'react-router';
import { csvDate } from '@/components/inventory/csv';
import { timeOf } from '@/components/inventory/sort';
import type { ColumnDef, GroupOption, ItemSummary, SortOption } from '@/components/inventory/types';
import { Thumb } from '@/components/Thumb';
import { Badge } from '@/components/ui/badge';
import { formatDate, mediaUrl, parseDate, rigLabel, type Gear, type Rig } from '@/lib/api';

export interface GearLookups {
  rigOf: (id?: string) => Rig | undefined;
  nameOf: (id?: string) => string | undefined;
}

const dash = <span className="text-muted-foreground">—</span>;
const gearName = (g: Gear) => g.name || 'Unnamed gear';

export function gearColumns({ rigOf, nameOf }: GearLookups): ColumnDef<Gear>[] {
  const rigText = (g: Gear) => {
    if (!g.assignedRigId) return '';
    const rig = rigOf(g.assignedRigId);
    return rig ? rigLabel(rig) : 'Unknown rig';
  };
  const personText = (g: Gear) =>
    g.assignedPersonId ? (nameOf(g.assignedPersonId) ?? 'Unknown person') : '';
  return [
    {
      id: 'photo',
      label: 'Photo',
      render: (g) => <Thumb url={g.imageUrl} alt={gearName(g)} className="size-10 rounded-md" />,
      text: (g) => mediaUrl(g.imageUrl) ?? '',
      className: 'w-14',
    },
    {
      id: 'name',
      label: 'Name',
      hideable: false,
      render: (g) => <span className="font-medium">{gearName(g)}</span>,
      text: (g) => g.name ?? '',
      sortValue: (g) => g.name?.trim(),
    },
    {
      id: 'type',
      label: 'Type',
      render: (g) => g.type || dash,
      text: (g) => g.type ?? '',
      sortValue: (g) => g.type?.trim(),
    },
    {
      id: 'serial',
      label: 'Serial',
      render: (g) => g.serialNumber || dash,
      text: (g) => g.serialNumber ?? '',
      sortValue: (g) => g.serialNumber?.trim(),
      className: 'whitespace-nowrap',
    },
    {
      id: 'made',
      label: 'Made',
      render: (g) => <span className="whitespace-nowrap">{formatDate(g.dateOfManufacture) || dash}</span>,
      text: (g) => csvDate(g.dateOfManufacture),
      sortValue: (g) => timeOf(parseDate(g.dateOfManufacture)),
    },
    {
      id: 'rig',
      label: 'Rig',
      render: (g) =>
        g.assignedRigId ? (
          <Link to={`/rigs/${g.assignedRigId}`} className="whitespace-nowrap hover:underline">
            {rigText(g)}
          </Link>
        ) : (
          dash
        ),
      text: rigText,
      sortValue: (g) => rigText(g) || null,
    },
    {
      id: 'person',
      label: 'Person',
      render: (g) =>
        g.assignedPersonId ? (
          <Link to={`/people/${g.assignedPersonId}`} className="whitespace-nowrap hover:underline">
            {personText(g)}
          </Link>
        ) : (
          dash
        ),
      text: personText,
      sortValue: (g) => personText(g) || null,
    },
    {
      id: 'notes',
      label: 'Notes',
      defaultVisible: false,
      render: (g) => <span className="line-clamp-2 max-w-xs text-muted-foreground">{g.notes}</span>,
      text: (g) => g.notes ?? '',
      sortValue: (g) => g.notes,
    },
    {
      id: 'updated',
      label: 'Updated',
      defaultVisible: false,
      render: (g) => <span className="whitespace-nowrap">{formatDate(g.updatedAt) || dash}</span>,
      text: (g) => csvDate(g.updatedAt),
      sortValue: (g) => timeOf(parseDate(g.updatedAt)),
    },
  ];
}

export const gearSorts: SortOption<Gear>[] = [
  { id: 'name', label: 'Name', value: (g) => g.name?.trim() },
  { id: 'type', label: 'Type', value: (g) => g.type?.trim() },
  { id: 'serial', label: 'Serial', value: (g) => g.serialNumber?.trim() },
  { id: 'made', label: 'Made', value: (g) => timeOf(parseDate(g.dateOfManufacture)) },
  { id: 'updated', label: 'Recently changed', value: (g) => timeOf(parseDate(g.updatedAt)), defaultDir: 'desc' },
];

const assignmentGroups = {
  rig: { key: 'rig', label: 'On a rig', rank: 0 },
  person: { key: 'person', label: 'With a person', rank: 1 },
  none: { key: 'none', label: 'Unassigned', rank: 2 },
};

export function gearGroups({ rigOf, nameOf }: GearLookups): GroupOption<Gear>[] {
  return [
    {
      id: 'type',
      label: 'Type',
      of: (g) => {
        const t = g.type?.trim();
        return t ? { key: t.toLowerCase(), label: t } : { key: '', label: 'No type', rank: 1 };
      },
    },
    {
      id: 'rig',
      label: 'Rig',
      of: (g) => {
        if (!g.assignedRigId) return { key: '', label: 'Not on a rig', rank: 1 };
        const rig = rigOf(g.assignedRigId);
        return { key: g.assignedRigId, label: rig ? rigLabel(rig) : 'Unknown rig' };
      },
    },
    {
      id: 'person',
      label: 'Person',
      of: (g) =>
        g.assignedPersonId
          ? { key: g.assignedPersonId, label: nameOf(g.assignedPersonId) ?? 'Unknown person' }
          : { key: '', label: 'No person', rank: 1 },
    },
    {
      id: 'assignment',
      label: 'Assignment',
      of: (g) =>
        g.assignedRigId ? assignmentGroups.rig : g.assignedPersonId ? assignmentGroups.person : assignmentGroups.none,
    },
  ];
}

export function gearSummary(g: Gear, { rigOf, nameOf }: GearLookups): ItemSummary {
  const rig = g.assignedRigId ? rigOf(g.assignedRigId) : undefined;
  return {
    title: gearName(g),
    subtitle: [
      g.type,
      g.assignedRigId && (rig ? rigLabel(rig) : 'Unknown rig'),
      g.assignedPersonId && (nameOf(g.assignedPersonId) ?? 'Unknown person'),
    ]
      .filter(Boolean)
      .join(' · '),
    imageUrl: g.imageUrl,
    badges: !g.assignedRigId && !g.assignedPersonId ? <Badge>Unassigned</Badge> : undefined,
  };
}
