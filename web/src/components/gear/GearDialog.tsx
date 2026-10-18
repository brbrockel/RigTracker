import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Field } from '@/components/Field';
import { MediaPicker } from '@/components/MediaPicker';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import {
  api,
  dateInputValue,
  errorMessage,
  personName,
  rigLabel,
  type Gear,
  type Person,
  type Rig,
} from '@/lib/api';
import { keys } from '@/lib/queries';

const NOTES_MAX = 1000;

/** New / edit gear form. Pass gear to edit; null or undefined to add a new item. */
export function GearDialog({
  open,
  onOpenChange,
  gear,
  rigs,
  people,
  types,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gear?: Gear | null;
  rigs: Rig[];
  people: Person[];
  /** Types already in use, offered as suggestions. */
  types: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={gear ? 'Edit gear' : 'New gear'}>
        {open && (
          <GearForm
            key={gear?._id ?? 'new'}
            gear={gear}
            rigs={rigs}
            people={people}
            types={types}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function GearForm({
  gear,
  rigs,
  people,
  types,
  onDone,
}: {
  gear?: Gear | null;
  rigs: Rig[];
  people: Person[];
  types: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(gear?.name ?? '');
  const [type, setType] = useState(gear?.type ?? '');
  const [serialNumber, setSerialNumber] = useState(gear?.serialNumber ?? '');
  const [dom, setDom] = useState(dateInputValue(gear?.dateOfManufacture));
  const [notes, setNotes] = useState(gear?.notes ?? '');
  const [imageUrl, setImageUrl] = useState<string | undefined>(gear?.imageUrl || undefined);
  const [rigId, setRigId] = useState(gear?.assignedRigId ?? '');
  const [personId, setPersonId] = useState(
    gear?.assignedRigId ? '' : (gear?.assignedPersonId ?? ''),
  );

  const nameOf = (id?: string) => {
    const p = id ? people.find((x) => x._id === id) : undefined;
    return p ? personName(p) || 'Unnamed person' : '';
  };
  const rig = rigId ? rigs.find((r) => r._id === rigId) : undefined;
  const movesPerson =
    !!gear &&
    !!rigId &&
    rigId !== (gear.assignedRigId ?? '') &&
    !!gear.assignedPersonId &&
    gear.assignedPersonId !== rig?.primaryUserId;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {
        name: name.trim(),
        type: type.trim(),
        notes: notes.trim(),
        // On a rig, the gear goes with the rig's primary person (the API sets it).
        assignedRigId: rigId || null,
        assignedPersonId: rigId ? null : personId || null,
      };
      // Serial numbers are unique, so a blank one is left out rather than saved as "".
      if (serialNumber.trim()) body.serialNumber = serialNumber.trim();
      if (dom) body.dateOfManufacture = dom;
      else if (gear) body.dateOfManufacture = null;
      if (imageUrl) body.imageUrl = imageUrl;
      else if (gear) body.imageUrl = null;
      return gear
        ? api<Gear>(`/gear/${gear._id}`, { method: 'PUT', body })
        : api<Gear>('/gear', { method: 'POST', body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.gear });
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const sortedPeople = [...people].sort((a, b) => personName(a).localeCompare(personName(b)));
  const sortedRigs = [...rigs].sort((a, b) =>
    rigLabel(a).localeCompare(rigLabel(b), undefined, { numeric: true }),
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field id="gear-name" label="Name">
        <Input id="gear-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="gear-type" label="Type">
          <Input
            id="gear-type"
            required
            list="gear-types"
            placeholder="Helmet, altimeter…"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
          <datalist id="gear-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field id="gear-serial" label="Serial number">
          <Input
            id="gear-serial"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </Field>
        <Field id="gear-dom" label="Date of manufacture">
          <Input id="gear-dom" type="date" value={dom} onChange={(e) => setDom(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="gear-rig" label="Rig">
          <Select id="gear-rig" value={rigId} onChange={(e) => setRigId(e.target.value)}>
            <option value="">Not on a rig</option>
            {sortedRigs.map((r) => (
              <option key={r._id} value={r._id}>
                {rigLabel(r)}
                {r.primaryUserId ? ` (${nameOf(r.primaryUserId) || 'Unknown person'})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="gear-person" label="Person">
          <Select
            id="gear-person"
            value={rig ? (rig.primaryUserId ?? '') : personId}
            disabled={!!rigId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            <option value="">{rigId ? 'No one (rig has no primary person)' : 'No one'}</option>
            {sortedPeople.map((p) => (
              <option key={p._id} value={p._id}>
                {personName(p) || p.email || 'Unnamed person'}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {rigId && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Gear on a rig goes with the rig's primary person.
          {movesPerson &&
            ` Saving moves it from ${nameOf(gear?.assignedPersonId) || 'its current person'}.`}
        </p>
      )}

      <Field id="gear-notes" label="Notes" hint={`${notes.length}/${NOTES_MAX}`}>
        <textarea
          id="gear-notes"
          rows={3}
          maxLength={NOTES_MAX}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border bg-card px-3 py-2 text-base shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
      </Field>
      <MediaPicker
        value={imageUrl}
        onChange={setImageUrl}
        folder={`gear/${name.trim() || 'uncategorized'}`}
      />

      {save.isError && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !name.trim() || !type.trim()}>
          {save.isPending ? 'Saving…' : gear ? 'Save' : 'Add gear'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
