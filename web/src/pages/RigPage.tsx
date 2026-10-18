import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Pencil, Trash2, Unlink } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { GearSummary } from '@/components/gear/GearSummary';
import { RepackBadge } from '@/components/rigs/RepackBadge';
import { RigDialog } from '@/components/rigs/RigDialog';
import { RowMenu } from '@/components/RowMenu';
import { Thumb } from '@/components/Thumb';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/input';
import {
  ApiError,
  api,
  canDelete,
  canWrite,
  errorMessage,
  formatDate,
  personName,
  rigLabel,
  type Gear,
  type Rig,
} from '@/lib/api';
import { keys, useGear, usePeople, useRig, useRigs } from '@/lib/queries';

export function RigPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const rig = useRig(id);
  const gear = useGear();
  const people = usePeople();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState<Gear | null>(null);

  const back = (
    <Link
      to="/rigs"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Rigs
    </Link>
  );

  if (rig.isError) {
    const missing = rig.error instanceof ApiError && rig.error.status === 404;
    return (
      <div className="flex flex-col gap-5">
        {back}
        {missing ? (
          <p className="text-sm text-muted-foreground">
            Rig not found. It may have been deleted.{' '}
            <Link to="/rigs" className="text-primary underline-offset-4 hover:underline">
              See all rigs
            </Link>
          </p>
        ) : (
          <Alert variant="destructive">{errorMessage(rig.error)}</Alert>
        )}
      </div>
    );
  }
  if (!rig.data)
    return (
      <div className="flex flex-col gap-5">
        {back}
        <p className="text-sm text-muted-foreground">Loading rig…</p>
      </div>
    );

  const r = rig.data;
  const writer = canWrite(user);
  const admin = canDelete(user);
  const nameOf = (pid?: string) => {
    const p = pid ? people.data?.find((x) => x.id === pid) : undefined;
    return p ? personName(p) || 'Unnamed person' : undefined;
  };
  const primary = nameOf(r.primaryUserId);
  const onRig = (gear.data ?? []).filter((g) => g.assignedRigId === r.id);

  return (
    <div className="flex flex-col gap-5">
      {back}

      <Card className="p-4">
        <div className="flex items-start gap-4">
          <Thumb url={r.imageUrl} alt={rigLabel(r)} className="size-24 sm:size-28" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{rigLabel(r)}</h1>
            <p className="text-sm text-muted-foreground">
              {r.primaryUserId ? (
                <Link
                  to={`/people/${r.primaryUserId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {primary ?? 'Unknown person'}
                </Link>
              ) : (
                'No primary person'
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <RepackBadge rig={r} />
            </div>
          </div>
        </div>
        {(writer || admin) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {writer && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            )}
            {admin && (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2 /> Delete
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Item term="Name">{r.name}</Item>
            <Item term="Number">{r.number}</Item>
            <Item term="Container">{r.container}</Item>
            <Item term="Container serial">{r.containerSerialNumber}</Item>
            <Item term="Container made">{formatDate(r.containerDOM)}</Item>
            <Item term="Main size">{r.mainSize}</Item>
            <Item term="Main serial">{r.mainSerialNumber}</Item>
            <Item term="Main made">{formatDate(r.mainDOM)}</Item>
            <Item term="Reserve size">{r.reserveSize}</Item>
            <Item term="Reserve serial">{r.reserveSerialNumber}</Item>
            <Item term="Reserve made">{formatDate(r.reserveDOM)}</Item>
            <Item term="AAD type">{r.aadType}</Item>
            <Item term="AAD serial">{r.aadSerialNumber}</Item>
            <Item term="AAD made">{formatDate(r.aadDOM)}</Item>
            <Item term="Last packed">{formatDate(r.lastPacked)}</Item>
            <Item term="Repack due">{formatDate(r.repackDue)}</Item>
            <Item term="Rigger">{r.riggerINT}</Item>
          </dl>
          {r.notes && (
            <div className="mt-4 text-sm">
              <div className="font-medium">Notes</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Gear on this rig</h2>
            <p className="text-sm text-muted-foreground">
              {r.primaryUserId
                ? `Gear here goes with ${primary ?? 'the primary person'}.`
                : 'No primary person, so gear here isn’t with anyone.'}
            </p>
          </div>
          {writer && (
            <Button variant="outline" onClick={() => setAssigning(true)}>
              <Link2 /> Assign gear
            </Button>
          )}
        </div>
        {gear.isError && <Alert variant="destructive">{errorMessage(gear.error)}</Alert>}
        {gear.isPending && <p className="text-sm text-muted-foreground">Loading gear…</p>}
        {onRig.map((g) => (
          <Card key={g.id} className="p-4">
            <div className="flex items-start gap-3">
              <GearSummary gear={g} />
              {writer && (
                <RowMenu label={g.name || 'gear'}>
                  <DropdownMenuItem onSelect={() => setUnassigning(g)}>
                    <Unlink /> Unassign
                  </DropdownMenuItem>
                </RowMenu>
              )}
            </div>
          </Card>
        ))}
        {gear.data && onRig.length === 0 && (
          <p className="text-sm text-muted-foreground">No gear on this rig yet.</p>
        )}
      </div>

      <RigDialog open={editing} onOpenChange={setEditing} rig={r} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${rigLabel(r)}?`}
        description="Its gear stays in the list, unassigned. This can't be undone."
        onConfirm={async () => {
          await api(`/rigs/${r.id}`, { method: 'DELETE' });
          qc.removeQueries({ queryKey: keys.rig(r.id) });
          navigate('/rigs', { replace: true });
          await Promise.all([
            qc.invalidateQueries({ queryKey: keys.rigs }),
            qc.invalidateQueries({ queryKey: keys.gear }),
          ]);
        }}
      />
      <ConfirmDialog
        open={!!unassigning}
        onOpenChange={(o) => !o && setUnassigning(null)}
        title={`Take ${unassigning?.name || 'this gear'} off this rig?`}
        description="It stays in the gear list, unassigned."
        confirmLabel="Unassign"
        onConfirm={async () => {
          await api(`/gear/${unassigning!.id}`, {
            method: 'PUT',
            body: { assignedRigId: null, assignedPersonId: null },
          });
          await qc.invalidateQueries({ queryKey: keys.gear });
        }}
      />
      {assigning && (
        <AssignGearDialog
          rig={r}
          gear={gear.data ?? []}
          nameOf={nameOf}
          onClose={() => setAssigning(false)}
        />
      )}
    </div>
  );
}

function Item({ term, children }: { term: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children || '—'}</dd>
    </div>
  );
}

/** Puts a gear item on this rig. Unassigned gear first; gear elsewhere moves here. */
function AssignGearDialog({
  rig,
  gear,
  nameOf,
  onClose,
}: {
  rig: Rig;
  gear: Gear[];
  nameOf: (personId?: string) => string | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const rigs = useRigs();
  const [gearId, setGearId] = useState('');
  const others = gear
    .filter((g) => g.assignedRigId !== rig.id)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const unassigned = others.filter((g) => !g.assignedRigId && !g.assignedPersonId);
  const withPerson = others.filter((g) => !g.assignedRigId && g.assignedPersonId);
  const onOtherRig = others.filter((g) => g.assignedRigId);
  const label = (g: Gear) =>
    [g.name || 'Unnamed gear', g.type, g.serialNumber].filter(Boolean).join(' · ');
  const rigName = (rid?: string) => rigLabel(rigs.data?.find((x) => x.id === rid)) || 'another rig';
  const selected = others.find((g) => g.id === gearId);

  const assign = useMutation({
    mutationFn: () =>
      api<Gear>(`/gear/${gearId}`, { method: 'PUT', body: { assignedRigId: rig.id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.gear });
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    assign.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Assign gear" description={`Put a gear item on ${rigLabel(rig)}.`}>
        {others.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All gear is already on this rig. Add more on the{' '}
            <Link to="/gear" className="text-primary underline-offset-4 hover:underline">
              Gear
            </Link>{' '}
            page.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              id="assign-gear"
              label="Gear"
              hint={
                selected?.assignedRigId
                  ? `This moves it off ${rigName(selected.assignedRigId)}.`
                  : selected?.assignedPersonId
                    ? `This moves it from ${nameOf(selected.assignedPersonId) ?? 'its person'} to this rig.`
                    : undefined
              }
            >
              <Select
                id="assign-gear"
                required
                value={gearId}
                onChange={(e) => setGearId(e.target.value)}
              >
                <option value="">Choose gear…</option>
                {unassigned.length > 0 && (
                  <optgroup label="Unassigned">
                    {unassigned.map((g) => (
                      <option key={g.id} value={g.id}>
                        {label(g)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {withPerson.length > 0 && (
                  <optgroup label="With a person">
                    {withPerson.map((g) => (
                      <option key={g.id} value={g.id}>
                        {label(g)} ({nameOf(g.assignedPersonId) ?? 'Unknown person'})
                      </option>
                    ))}
                  </optgroup>
                )}
                {onOtherRig.length > 0 && (
                  <optgroup label="On another rig">
                    {onOtherRig.map((g) => (
                      <option key={g.id} value={g.id}>
                        {label(g)} ({rigName(g.assignedRigId)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
            {assign.isError && <Alert variant="destructive">{errorMessage(assign.error)}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" disabled={!gearId || assign.isPending}>
                {assign.isPending ? 'Assigning…' : 'Assign'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
