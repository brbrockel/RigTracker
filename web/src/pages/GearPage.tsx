import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Unlink, UserRound, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  assignmentBody,
  BulkAssignDialog,
  type BulkAssignMode,
} from '@/components/gear/BulkAssignDialog';
import { GearCard } from '@/components/gear/GearCard';
import { gearColumns, gearGroups, gearSorts, gearSummary } from '@/components/gear/gearColumns';
import { GearDialog } from '@/components/gear/GearDialog';
import { useBulkRunner } from '@/components/inventory/bulk';
import { InventoryBrowser } from '@/components/inventory/InventoryBrowser';
import { PageHeader } from '@/components/PageHeader';
import { RowMenu } from '@/components/RowMenu';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { api, canDelete, canWrite, errorMessage, personName, type Gear } from '@/lib/api';
import { invalidateGear, keys, useGear, usePeople, useRigs } from '@/lib/queries';

type Assignment = '' | 'rig' | 'person' | 'none';

const gearLabel = (g: Gear) => g.name || 'Unnamed gear';

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
  // Bulk changes: the selected gear and how to clear the selection afterwards.
  const [assigning, setAssigning] = useState<{
    mode: BulkAssignMode;
    gear: Gear[];
    clear: () => void;
  } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState<{ gear: Gear[]; clear: () => void } | null>(
    null,
  );
  const [bulkError, setBulkError] = useState('');
  const bulk = useBulkRunner();

  const rigById = useMemo(() => new Map((rigs.data ?? []).map((r) => [r.id, r])), [rigs.data]);
  const nameById = useMemo(
    () => new Map((people.data ?? []).map((p) => [p.id, personName(p) || 'Unnamed person'])),
    [people.data],
  );
  const lookups = useMemo(
    () => ({
      rigOf: (id?: string) => (id ? rigById.get(id) : undefined),
      nameOf: (id?: string) => (id ? nameById.get(id) : undefined),
    }),
    [rigById, nameById],
  );
  const columns = useMemo(() => gearColumns(lookups), [lookups]);
  const groups = useMemo(() => gearGroups(lookups), [lookups]);
  const types = useMemo(
    () =>
      Array.from(
        new Set((gear.data ?? []).map((g) => g.type?.trim()).filter((t): t is string => !!t)),
      ).sort((a, b) => a.localeCompare(b)),
    [gear.data],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (gear.data ?? []).filter((g) => {
      if (typeFilter && g.type?.trim() !== typeFilter) return false;
      if (assignment === 'rig' && !g.assignedRigId) return false;
      if (assignment === 'person' && (g.assignedRigId || !g.assignedPersonId)) return false;
      if (assignment === 'none' && (g.assignedRigId || g.assignedPersonId)) return false;
      if (!q) return true;
      return [g.name, g.serialNumber, g.type].some((v) => v?.toLowerCase().includes(q));
    });
  }, [gear.data, search, typeFilter, assignment]);

  const writer = canWrite(user);
  const admin = canDelete(user);
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.gear }),
      qc.invalidateQueries({ queryKey: keys.rigs }),
    ]);

  const unassign = async (list: Gear[], clear: () => void) => {
    setBulkError('');
    const result = await bulk.run(list, {
      verb: 'Updating',
      past: 'Updated',
      label: gearLabel,
      each: (g) => api(`/gear/${g.id}`, { method: 'PUT', body: assignmentBody('none', '') }),
    });
    await invalidate();
    if (result.ok) clear();
    else setBulkError(result.message ?? 'Something went wrong.');
  };

  const rowMenu = (g: Gear) => (
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
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
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
      </div>

      <InventoryBrowser
        pageKey="gear"
        title="Gear"
        rows={shown}
        columns={columns}
        sortOptions={gearSorts}
        groupOptions={groups}
        defaultSort={{ by: 'name', dir: 'asc' }}
        getId={(g) => g.id}
        getLabel={gearLabel}
        summary={(g) => gearSummary(g, lookups)}
        renderCard={(g, { select, menu }) => (
          <GearCard
            gear={g}
            rig={lookups.rigOf(g.assignedRigId)}
            personName={lookups.nameOf(g.assignedPersonId)}
            select={select}
            menu={menu}
          />
        )}
        rowMenu={writer ? rowMenu : undefined}
        filters={
          <>
            <Input
              aria-label="Search gear"
              placeholder="Search by name, serial or type"
              className="min-w-0 flex-[1_1_16rem]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label="Filter by type"
              className="flex-[1_1_9rem] sm:w-40 sm:flex-none"
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
              className="flex-[1_1_9rem] sm:w-44 sm:flex-none"
              value={assignment}
              onChange={(e) => setAssignment(e.target.value as Assignment)}
            >
              <option value="">Any assignment</option>
              <option value="rig">On a rig</option>
              <option value="person">With a person</option>
              <option value="none">Unassigned</option>
            </Select>
          </>
        }
        notice={
          <>
            {gear.isError && <Alert variant="destructive">{errorMessage(gear.error)}</Alert>}
            {gear.isPending && <p className="text-sm text-muted-foreground">Loading gear…</p>}
          </>
        }
        empty={
          gear.data && gear.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No gear yet.{writer && ' Add the first item with New gear.'}
            </p>
          ) : gear.data ? (
            <p className="text-sm text-muted-foreground">No gear matches.</p>
          ) : null
        }
        bulkActions={(selected, clear) =>
          writer && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={bulk.busy}
                onClick={() => setAssigning({ mode: 'rig', gear: selected, clear })}
              >
                <Wrench /> Assign to rig…
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulk.busy}
                onClick={() => setAssigning({ mode: 'person', gear: selected, clear })}
              >
                <UserRound /> Assign to person…
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulk.busy}
                onClick={() => unassign(selected, clear)}
              >
                <Unlink /> Unassign
              </Button>
              {admin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={bulk.busy}
                  onClick={() => setBulkDeleting({ gear: selected, clear })}
                >
                  <Trash2 /> Delete…
                </Button>
              )}
            </>
          )
        }
        bulkStatus={
          (bulk.progress && !bulkDeleting && !assigning) || bulkError ? (
            <div aria-live="polite" className="px-2 text-sm">
              {bulkError ? (
                <Alert variant="destructive">{bulkError}</Alert>
              ) : (
                <span className="text-muted-foreground">{bulk.progress}</span>
              )}
            </div>
          ) : undefined
        }
      />

      <GearDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        gear={editing}
        rigs={rigs.data ?? []}
        people={people.data ?? []}
        types={types}
      />
      {assigning && (
        <BulkAssignDialog
          mode={assigning.mode}
          gear={assigning.gear}
          rigs={rigs.data ?? []}
          people={people.data ?? []}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setBulkError('');
            assigning.clear();
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name || 'this gear'}?`}
        description="Its photos and videos are deleted too. This can't be undone."
        onConfirm={async () => {
          await api(`/gear/${deleting!.id}`, { method: 'DELETE' });
          await invalidateGear(qc);
        }}
      />
      <ConfirmDialog
        open={!!bulkDeleting}
        onOpenChange={(o) => !o && !bulk.busy && setBulkDeleting(null)}
        title={`Delete ${bulkDeleting?.gear.length ?? 0} gear item${bulkDeleting?.gear.length === 1 ? '' : 's'}?`}
        description="Their photos and videos are deleted too. This can't be undone."
        confirmLabel={`Delete ${bulkDeleting?.gear.length ?? 0}`}
        onConfirm={async () => {
          const { gear: list, clear } = bulkDeleting!;
          const result = await bulk.run(list, {
            verb: 'Deleting',
            past: 'Deleted',
            label: gearLabel,
            each: (g) => api(`/gear/${g.id}`, { method: 'DELETE' }),
          });
          await invalidate();
          if (!result.ok) {
            // A retry carries on with the ones that are left.
            setBulkDeleting({ gear: list.filter((g) => !result.done.includes(g)), clear });
            throw new Error(result.message);
          }
          setBulkError('');
          clear();
        }}
      >
        {bulk.progress && (
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            {bulk.progress}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
