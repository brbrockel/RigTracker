import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useBulkRunner } from '@/components/inventory/bulk';
import { InventoryBrowser } from '@/components/inventory/InventoryBrowser';
import { PageHeader } from '@/components/PageHeader';
import { repackState } from '@/components/rigs/RepackBadge';
import { RigCard } from '@/components/rigs/RigCard';
import { rigColumns, rigGroups, rigSorts, rigSummary } from '@/components/rigs/rigColumns';
import { RigDialog } from '@/components/rigs/RigDialog';
import { RowMenu } from '@/components/RowMenu';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import {
  RIG_SLOTS,
  api,
  canDelete,
  canWrite,
  daysUntil,
  errorMessage,
  personName,
  rigLabel,
  type Rig,
} from '@/lib/api';
import { keys, usePeople, useRigs } from '@/lib/queries';

type Filter = '' | 'overdue' | 'soon' | 'repack' | 'nobody';
const FILTERS: Filter[] = ['', 'overdue', 'soon', 'repack', 'nobody'];
/** The repack reminders' window (as the admins' banner counts them). */
const REMINDER_DAYS = 14;

export function RigsPage() {
  const user = useUser();
  const rigs = useRigs();
  const people = usePeople();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [params] = useSearchParams();
  // ?filter=repack comes from the admins' repack banner.
  const [filter, setFilter] = useState<Filter>(() => {
    const f = params.get('filter') as Filter | null;
    return f && FILTERS.includes(f) ? f : '';
  });
  const [editing, setEditing] = useState<Rig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Rig | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState<{ rigs: Rig[]; clear: () => void } | null>(null);
  const bulk = useBulkRunner();

  const nameById = useMemo(
    () => new Map((people.data ?? []).map((p) => [p.id, personName(p)])),
    [people.data],
  );
  const nameOf = useCallback((id?: string) => (id ? nameById.get(id) : undefined), [nameById]);
  const columns = useMemo(() => rigColumns(nameOf), [nameOf]);
  const sorts = useMemo(() => rigSorts(nameOf), [nameOf]);
  const groups = useMemo(() => rigGroups(nameOf), [nameOf]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rigs.data ?? []).filter((r) => {
      if (filter === 'overdue' && repackState(r) !== 'overdue') return false;
      if (filter === 'soon' && repackState(r) !== 'soon') return false;
      if (filter === 'repack') {
        const days = daysUntil(r.repackDue);
        if (days === null || days > REMINDER_DAYS) return false;
      }
      if (filter === 'nobody' && r.primaryUserId) return false;
      if (!q) return true;
      return [
        r.name,
        r.number,
        ...RIG_SLOTS.flatMap((slot) => [
          r.components?.[slot]?.name ?? undefined,
          r.components?.[slot]?.serialNumber ?? undefined,
        ]),
        r.primaryUserId ? nameById.get(r.primaryUserId) : '',
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rigs.data, search, filter, nameById]);

  const writer = canWrite(user);
  const admin = canDelete(user);
  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.rigs }),
      qc.invalidateQueries({ queryKey: keys.gear }),
    ]);

  const rowMenu = (r: Rig) => (
    <RowMenu label={rigLabel(r)}>
      <DropdownMenuItem
        onSelect={() => {
          setEditing(r);
          setDialogOpen(true);
        }}
      >
        <Pencil /> Edit
      </DropdownMenuItem>
      {admin && (
        <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(r)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      )}
    </RowMenu>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <PageHeader
          title="Rigs"
          subtitle="Every rig, who jumps it and when the reserve is due."
          action={
            writer && (
              <Button onClick={openNew}>
                <Plus /> New rig
              </Button>
            )
          }
        />
      </div>

      <InventoryBrowser
        pageKey="rigs"
        title="Rigs"
        rows={shown}
        columns={columns}
        sortOptions={sorts}
        groupOptions={groups}
        defaultSort={{ by: 'number', dir: 'asc' }}
        getId={(r) => r.id}
        getLabel={rigLabel}
        summary={(r) => rigSummary(r, nameOf)}
        renderCard={(r, { select, menu }) => (
          <RigCard rig={r} person={nameOf(r.primaryUserId)} select={select} menu={menu} />
        )}
        rowMenu={writer ? rowMenu : undefined}
        filters={
          <>
            <Input
              aria-label="Search rigs"
              placeholder="Search by name, number, serial or person"
              className="min-w-0 flex-[1_1_16rem]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              aria-label="Filter rigs"
              className="flex-[1_1_10rem] sm:w-52 sm:flex-none"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
            >
              <option value="">All rigs</option>
              <option value="overdue">Repack overdue</option>
              <option value="soon">Due in 30 days</option>
              <option value="repack">Overdue or due in {REMINDER_DAYS} days</option>
              <option value="nobody">No primary person</option>
            </Select>
          </>
        }
        notice={
          <>
            {rigs.isError && <Alert variant="destructive">{errorMessage(rigs.error)}</Alert>}
            {rigs.isPending && <p className="text-sm text-muted-foreground">Loading rigs…</p>}
          </>
        }
        empty={
          rigs.data && rigs.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rigs yet.{writer && ' Add the first one with New rig.'}
            </p>
          ) : rigs.data ? (
            <p className="text-sm text-muted-foreground">No rigs match.</p>
          ) : null
        }
        bulkActions={(selected, clear) =>
          admin && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setBulkDeleting({ rigs: selected, clear })}
            >
              <Trash2 /> Delete…
            </Button>
          )
        }
      />

      <RigDialog open={dialogOpen} onOpenChange={setDialogOpen} rig={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${rigLabel(deleting)}?`}
        description="Its gear stays in the list, unassigned. Its photos and videos are deleted. This can't be undone."
        onConfirm={async () => {
          await api(`/rigs/${deleting!.id}`, { method: 'DELETE' });
          await invalidate();
        }}
      />
      <ConfirmDialog
        open={!!bulkDeleting}
        onOpenChange={(o) => !o && !bulk.busy && setBulkDeleting(null)}
        title={`Delete ${bulkDeleting?.rigs.length ?? 0} rig${bulkDeleting?.rigs.length === 1 ? '' : 's'}?`}
        description="Their gear stays in the list, unassigned. Their photos and videos are deleted. This can't be undone."
        confirmLabel={`Delete ${bulkDeleting?.rigs.length ?? 0}`}
        onConfirm={async () => {
          const { rigs: list, clear } = bulkDeleting!;
          const result = await bulk.run(list, {
            verb: 'Deleting',
            past: 'Deleted',
            label: rigLabel,
            each: (r) => api(`/rigs/${r.id}`, { method: 'DELETE' }),
          });
          await invalidate();
          if (!result.ok) {
            // A retry carries on with the ones that are left.
            setBulkDeleting({ rigs: list.filter((r) => !result.done.includes(r)), clear });
            throw new Error(result.message);
          }
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
