import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { RepackBadge, repackState } from '@/components/rigs/RepackBadge';
import { RigDialog } from '@/components/rigs/RigDialog';
import { RowMenu } from '@/components/RowMenu';
import { Thumb } from '@/components/Thumb';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { api, canDelete, canWrite, errorMessage, personName, rigLabel, type Rig } from '@/lib/api';
import { keys, usePeople, useRigs } from '@/lib/queries';

type Filter = '' | 'overdue' | 'soon' | 'nobody';

export function RigsPage() {
  const user = useUser();
  const rigs = useRigs();
  const people = usePeople();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [editing, setEditing] = useState<Rig | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Rig | null>(null);

  const nameById = useMemo(
    () => new Map((people.data ?? []).map((p) => [p._id, personName(p)])),
    [people.data],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rigs.data ?? [])
      .filter((r) => {
        if (filter === 'overdue' && repackState(r) !== 'overdue') return false;
        if (filter === 'soon' && repackState(r) !== 'soon') return false;
        if (filter === 'nobody' && r.primaryUserId) return false;
        if (!q) return true;
        return [
          r.name,
          r.number,
          r.containerSerialNumber,
          r.mainSerialNumber,
          r.reserveSerialNumber,
          r.aadSerialNumber,
          r.primaryUserId ? nameById.get(r.primaryUserId) : '',
        ].some((v) => v?.toLowerCase().includes(q));
      })
      .sort((a, b) => rigLabel(a).localeCompare(rigLabel(b), undefined, { numeric: true }));
  }, [rigs.data, search, filter, nameById]);

  const writer = canWrite(user);
  const admin = canDelete(user);
  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Search rigs"
          placeholder="Search by name, number, serial or person"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Filter rigs"
          className="sm:w-56"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="">All rigs</option>
          <option value="overdue">Repack overdue</option>
          <option value="soon">Due in 30 days</option>
          <option value="nobody">No primary person</option>
        </Select>
      </div>

      {rigs.isError && <Alert variant="destructive">{errorMessage(rigs.error)}</Alert>}
      {rigs.isPending && <p className="text-sm text-muted-foreground">Loading rigs…</p>}
      <div className="flex flex-col gap-3">
        {shown.map((r) => {
          const person = r.primaryUserId ? nameById.get(r.primaryUserId) : undefined;
          return (
            <Card key={r._id} className="p-4">
              <div className="flex items-center gap-3">
                <Link to={`/rigs/${r._id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Thumb url={r.imageUrl} alt={rigLabel(r)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{rigLabel(r)}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {r.primaryUserId ? person || 'Unknown person' : 'No primary person'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <RepackBadge rig={r} />
                    </div>
                  </div>
                </Link>
                {writer && (
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
                )}
              </div>
            </Card>
          );
        })}
        {rigs.data && rigs.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rigs yet.{writer && ' Add the first one with New rig.'}
          </p>
        )}
        {rigs.data && rigs.data.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted-foreground">No rigs match.</p>
        )}
      </div>

      <RigDialog open={dialogOpen} onOpenChange={setDialogOpen} rig={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${rigLabel(deleting)}?`}
        description="Its gear stays in the list, unassigned. This can't be undone."
        onConfirm={async () => {
          await api(`/rigs/${deleting!._id}`, { method: 'DELETE' });
          await Promise.all([
            qc.invalidateQueries({ queryKey: keys.rigs }),
            qc.invalidateQueries({ queryKey: keys.gear }),
          ]);
        }}
      />
    </div>
  );
}
