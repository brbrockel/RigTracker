import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Field } from '@/components/Field';
import { useBulkRunner } from '@/components/inventory/bulk';
import { collator } from '@/components/inventory/sort';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { api, personName, rigLabel, type Gear, type Person, type Rig } from '@/lib/api';
import { keys } from '@/lib/queries';

export type BulkAssignMode = 'rig' | 'person';

/**
 * The PUT body for a bulk assignment, mirroring the API's rules: gear on a rig goes with the
 * rig's primary person (the server fills it in), so giving gear to a person takes it off its rig.
 */
export function assignmentBody(mode: BulkAssignMode | 'none', targetId: string) {
  if (mode === 'rig') return { assignedRigId: targetId };
  if (mode === 'person') return { assignedRigId: null, assignedPersonId: targetId };
  return { assignedRigId: null, assignedPersonId: null };
}

const gearLabel = (g: Gear) => g.name || 'Unnamed gear';

/** Assigns the selected gear to one rig or one person, one request at a time. Mount it to open it. */
export function BulkAssignDialog({
  mode,
  gear,
  rigs,
  people,
  onClose,
  onDone,
}: {
  mode: BulkAssignMode;
  gear: Gear[];
  rigs: Rig[];
  people: Person[];
  onClose: () => void;
  /** Called after every item was changed. */
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const bulk = useBulkRunner();
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<Gear[]>(gear);

  const nameById = useMemo(() => new Map(people.map((p) => [p._id, personName(p)])), [people]);
  const sortedRigs = useMemo(() => [...rigs].sort((a, b) => collator.compare(rigLabel(a), rigLabel(b))), [rigs]);
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => collator.compare(personName(a), personName(b))),
    [people],
  );
  const onRigs = remaining.filter((g) => g.assignedRigId).length;
  const n = remaining.length;
  const things = `${n} item${n === 1 ? '' : 's'}`;

  async function apply() {
    setError('');
    const result = await bulk.run(remaining, {
      verb: 'Updating',
      past: 'Updated',
      label: gearLabel,
      each: (g) => api(`/gear/${g._id}`, { method: 'PUT', body: assignmentBody(mode, target) }),
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.gear }),
      qc.invalidateQueries({ queryKey: keys.rigs }),
    ]);
    if (result.ok) {
      onDone();
      onClose();
    } else {
      setRemaining(remaining.filter((g) => !result.done.includes(g)));
      setError(result.message ?? 'Something went wrong.');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !bulk.busy && onClose()}>
      <DialogContent
        title={mode === 'rig' ? `Assign ${things} to a rig` : `Assign ${things} to a person`}
        description={
          mode === 'rig'
            ? "Gear on a rig goes with the rig's primary person."
            : 'Gear on a rig goes with the rig’s primary person, so giving it to a person takes it off its rig.'
        }
      >
        <div className="flex flex-col gap-4">
          {mode === 'rig' ? (
            <Field id="bulk-rig" label="Rig">
              <Select id="bulk-rig" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a rig</option>
                {sortedRigs.map((r) => (
                  <option key={r._id} value={r._id}>
                    {rigLabel(r)}
                    {r.primaryUserId ? ` (${nameById.get(r.primaryUserId) || 'Unknown person'})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field id="bulk-person" label="Person">
              <Select id="bulk-person" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a person</option>
                {sortedPeople.map((p) => (
                  <option key={p._id} value={p._id}>
                    {personName(p) || p.email || 'Unnamed person'}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {mode === 'person' && onRigs > 0 && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {onRigs} of these {onRigs === 1 ? 'is' : 'are'} on a rig and will come off it.
            </p>
          )}
          {bulk.progress && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {bulk.progress}
            </p>
          )}
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={bulk.busy}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={!target || bulk.busy || n === 0}>
              {bulk.busy ? 'Working…' : `Assign ${things}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
