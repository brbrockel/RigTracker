import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GearDialog } from '@/components/gear/GearDialog';
import { GearSummary } from '@/components/gear/GearSummary';
import { PageHeader } from '@/components/PageHeader';
import { RowMenu } from '@/components/RowMenu';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import {
  api,
  canDelete,
  canWrite,
  errorMessage,
  personName,
  rigLabel,
  type Gear,
} from '@/lib/api';
import { keys, useGear, usePeople, useRigs } from '@/lib/queries';

type Assignment = '' | 'rig' | 'person' | 'none';

const pill = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent';

export function GearPage() {
  const user = useUser();
  const gear = useGear();
  const rigs = useRigs();
  const people = usePeople();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [assignment, setAssignment] = useState<Assignment>('');
  const [editing, setEditing] = useState<Gear | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Gear | null>(null);

  const rigById = useMemo(() => new Map((rigs.data ?? []).map((r) => [r._id, r])), [rigs.data]);
  const nameById = useMemo(
    () => new Map((people.data ?? []).map((p) => [p._id, personName(p) || 'Unnamed person'])),
    [people.data],
  );
  const types = useMemo(
    () =>
      Array.from(new Set((gear.data ?? []).map((g) => g.type?.trim()).filter((t): t is string => !!t))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [gear.data],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (gear.data ?? [])
      .filter((g) => {
        if (typeFilter && g.type?.trim() !== typeFilter) return false;
        if (assignment === 'rig' && !g.assignedRigId) return false;
        if (assignment === 'person' && (g.assignedRigId || !g.assignedPersonId)) return false;
        if (assignment === 'none' && (g.assignedRigId || g.assignedPersonId)) return false;
        if (!q) return true;
        return [g.name, g.serialNumber, g.type].some((v) => v?.toLowerCase().includes(q));
      })
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [gear.data, search, typeFilter, assignment]);

  const writer = canWrite(user);
  const admin = canDelete(user);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Gear"
        subtitle="Helmets, altimeters and everything else, and whose it is."
        action={
          writer && (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus /> New gear
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Search gear"
          placeholder="Search by name, serial or type"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Filter by type"
          className="sm:w-44"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by assignment"
          className="sm:w-44"
          value={assignment}
          onChange={(e) => setAssignment(e.target.value as Assignment)}
        >
          <option value="">Any assignment</option>
          <option value="rig">On a rig</option>
          <option value="person">With a person</option>
          <option value="none">Unassigned</option>
        </Select>
      </div>

      {gear.isError && <Alert variant="destructive">{errorMessage(gear.error)}</Alert>}
      {gear.isPending && <p className="text-sm text-muted-foreground">Loading gear…</p>}
      <div className="flex flex-col gap-3">
        {shown.map((g) => {
          const rig = g.assignedRigId ? rigById.get(g.assignedRigId) : undefined;
          return (
            <Card key={g._id} className="p-4">
              <div className="flex items-start gap-3">
                <GearSummary gear={g}>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.assignedRigId && (
                      <Link to={`/rigs/${g.assignedRigId}`} className={pill}>
                        Rig: {rig ? rigLabel(rig) : 'Unknown rig'}
                      </Link>
                    )}
                    {g.assignedPersonId && (
                      <Link to={`/people/${g.assignedPersonId}`} className={pill}>
                        Person: {nameById.get(g.assignedPersonId) ?? 'Unknown person'}
                      </Link>
                    )}
                    {!g.assignedRigId && !g.assignedPersonId && (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </div>
                  {g.notes && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{g.notes}</p>
                  )}
                </GearSummary>
                {writer && (
                  <RowMenu label={g.name || 'gear'}>
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(g);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    {admin && (
                      <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(g)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    )}
                  </RowMenu>
                )}
              </div>
            </Card>
          );
        })}
        {gear.data && gear.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No gear yet.{writer && ' Add the first item with New gear.'}
          </p>
        )}
        {gear.data && gear.data.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted-foreground">No gear matches.</p>
        )}
      </div>

      <GearDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        gear={editing}
        rigs={rigs.data ?? []}
        people={people.data ?? []}
        types={types}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name || 'this gear'}?`}
        description="This can't be undone."
        onConfirm={async () => {
          await api(`/gear/${deleting!._id}`, { method: 'DELETE' });
          await qc.invalidateQueries({ queryKey: keys.gear });
        }}
      />
    </div>
  );
}
