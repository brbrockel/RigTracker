import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Replace, Unlink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { RowMenu } from '@/components/RowMenu';
import { Thumb } from '@/components/Thumb';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import {
  RIG_SLOTS,
  SLOT_LABELS,
  api,
  errorMessage,
  formatDate,
  rigLabel,
  rigSlotLabel,
  type Gear,
  type Rig,
  type RigComponent,
  type RigSlot,
} from '@/lib/api';
import { invalidateGear, useRigs } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** A rig's container, main, reserve and AAD: the gear in each slot, changed in place. */
export function ComponentsCard({
  rig,
  gear,
  nameOf,
  writer,
}: {
  rig: Rig;
  /** All gear, to choose from. */
  gear: Gear[];
  nameOf: (personId?: string) => string | undefined;
  writer: boolean;
}) {
  const qc = useQueryClient();
  const [choosing, setChoosing] = useState<RigSlot | null>(null);
  const [removing, setRemoving] = useState<{ slot: RigSlot; c: RigComponent } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Components</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {RIG_SLOTS.map((slot) => {
            const c = rig.components?.[slot] ?? null;
            const label = SLOT_LABELS[slot];
            const meta = c
              ? [
                  c.serialNumber && `S/N ${c.serialNumber}`,
                  c.dateOfManufacture && `Made ${formatDate(c.dateOfManufacture)}`,
                ].filter(Boolean)
              : [];
            return (
              <li
                key={slot}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                aria-label={label}
              >
                {c ? (
                  <Thumb url={c.coverUrl} alt={c.name || label} className="size-12 rounded-md" />
                ) : (
                  <div className="size-12 shrink-0 rounded-md border border-dashed" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  {c ? (
                    <>
                      <div className="truncate font-medium">{c.name || 'Unnamed gear'}</div>
                      {meta.length > 0 && (
                        <div className="text-sm text-muted-foreground">{meta.join(' · ')}</div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">No {label}</div>
                  )}
                </div>
                {writer &&
                  (c ? (
                    <RowMenu label={`${label}: ${c.name || 'gear'}`}>
                      <DropdownMenuItem onSelect={() => setChoosing(slot)}>
                        <Replace /> Change…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setRemoving({ slot, c })}>
                        <Unlink /> Take off rig
                      </DropdownMenuItem>
                    </RowMenu>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setChoosing(slot)}
                      aria-label={`Add ${label}`}
                    >
                      <Plus /> Add
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      </CardContent>
      {choosing && (
        <ComponentDialog
          rig={rig}
          slot={choosing}
          gear={gear}
          nameOf={nameOf}
          onClose={() => setChoosing(null)}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Take ${removing?.c.name || 'this gear'} off this rig?`}
        description="It stays in the gear list, unassigned."
        confirmLabel="Take off rig"
        onConfirm={async () => {
          await api(`/gear/${removing!.c.id}`, {
            method: 'PUT',
            body: { assignedRigId: null, assignedPersonId: null },
          });
          await invalidateGear(qc);
        }}
      />
    </Card>
  );
}

const sameType = (g: Gear, slot: RigSlot) =>
  (g.type ?? '').trim().toLowerCase() === SLOT_LABELS[slot].toLowerCase();

/** Fills (or changes) one slot: existing gear, or new gear made for it. */
export function ComponentDialog({
  rig,
  slot,
  gear,
  nameOf,
  onClose,
}: {
  rig: Rig;
  slot: RigSlot;
  gear: Gear[];
  nameOf: (personId?: string) => string | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const rigs = useRigs();
  const label = SLOT_LABELS[slot];
  const current = rig.components?.[slot] ?? null;

  // Matching type first, then by name.
  const byFit = (a: Gear, b: Gear) =>
    Number(sameType(b, slot)) - Number(sameType(a, slot)) ||
    (a.name ?? '').localeCompare(b.name ?? '');
  const candidates = gear.filter((g) => g.id !== current?.id);
  const unassigned = candidates.filter((g) => !g.assignedRigId && !g.assignedPersonId).sort(byFit);
  const withPerson = candidates.filter((g) => !g.assignedRigId && g.assignedPersonId).sort(byFit);
  const onThisRig = candidates.filter((g) => g.assignedRigId === rig.id).sort(byFit);
  const onOtherRig = candidates
    .filter((g) => g.assignedRigId && g.assignedRigId !== rig.id)
    .sort(byFit);

  const [mode, setMode] = useState<'existing' | 'new'>(candidates.length ? 'existing' : 'new');
  const [gearId, setGearId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState(label);
  const [serialNumber, setSerialNumber] = useState('');
  const [dom, setDom] = useState('');

  const rigOf = (rid?: string) => rigs.data?.find((x) => x.id === rid);
  const optionLabel = (g: Gear) =>
    [g.name || 'Unnamed gear', g.type, g.serialNumber && `S/N ${g.serialNumber}`]
      .filter(Boolean)
      .join(' · ');
  const selected = candidates.find((g) => g.id === gearId);
  const moveNote = !selected
    ? undefined
    : selected.assignedRigId && selected.assignedRigId !== rig.id
      ? `This moves it off ${rigSlotLabel(rigOf(selected.assignedRigId), selected.slot)}.`
      : selected.assignedRigId === rig.id && selected.slot
        ? `This moves it from this rig’s ${SLOT_LABELS[selected.slot].toLowerCase()}.`
        : !selected.assignedRigId && selected.assignedPersonId
          ? `This moves it from ${nameOf(selected.assignedPersonId) ?? 'its person'} to this rig.`
          : undefined;

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {
        name: name.trim(),
        type: type.trim() || label,
        assignedRigId: rig.id,
        slot,
      };
      if (serialNumber.trim()) body.serialNumber = serialNumber.trim();
      if (dom) body.dateOfManufacture = dom;
      const fill = () =>
        mode === 'existing'
          ? api<Gear>(`/gear/${gearId}`, { method: 'PUT', body: { assignedRigId: rig.id, slot } })
          : api<Gear>('/gear', { method: 'POST', body });
      if (!current) return fill();
      // The gear there now stays on the rig as other gear (and goes back if this fails).
      await api<Gear>(`/gear/${current.id}`, { method: 'PUT', body: { slot: null } });
      try {
        return await fill();
      } catch (err) {
        await api(`/gear/${current.id}`, { method: 'PUT', body: { slot } }).catch(() => {});
        throw err;
      }
    },
    onSettled: () => invalidateGear(qc),
    onSuccess: onClose,
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const group = (title: string, list: Gear[], suffix?: (g: Gear) => string) =>
    list.length > 0 && (
      <optgroup label={title}>
        {list.map((g) => (
          <option key={g.id} value={g.id}>
            {optionLabel(g)}
            {suffix ? ` (${suffix(g)})` : ''}
          </option>
        ))}
      </optgroup>
    );
  const toggle = (value: 'existing' | 'new', text: string) => (
    <Button
      type="button"
      size="sm"
      variant={mode === value ? 'default' : 'ghost'}
      aria-pressed={mode === value}
      className={cn('flex-1')}
      onClick={() => setMode(value)}
    >
      {text}
    </Button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={current ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        description={
          current
            ? `${current.name || 'The gear there now'} stays on ${rigLabel(rig)} as other gear.`
            : `Put a ${label.toLowerCase()} on ${rigLabel(rig)}.`
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex gap-1 rounded-lg border p-1">
            {toggle('existing', 'Choose existing gear')}
            {toggle('new', 'New gear')}
          </div>
          {mode === 'existing' ? (
            candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other gear yet. Add new gear.</p>
            ) : (
              <Field id="component-gear" label="Gear" hint={moveNote}>
                <Select
                  id="component-gear"
                  required
                  value={gearId}
                  onChange={(e) => setGearId(e.target.value)}
                >
                  <option value="">Choose gear…</option>
                  {group('Unassigned', unassigned)}
                  {group(
                    'With a person',
                    withPerson,
                    (g) => nameOf(g.assignedPersonId) ?? 'Unknown person',
                  )}
                  {group('On this rig', onThisRig, (g) =>
                    g.slot ? `this rig’s ${SLOT_LABELS[g.slot].toLowerCase()}` : 'other gear',
                  )}
                  {group('On another rig (will be moved)', onOtherRig, (g) =>
                    rigSlotLabel(rigOf(g.assignedRigId), g.slot),
                  )}
                </Select>
              </Field>
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="component-name" label="Name">
                <Input
                  id="component-name"
                  required
                  placeholder={slot === 'main' ? 'Storm 150' : slot === 'aad' ? 'Cypres 2' : ''}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field id="component-type" label="Type">
                <Input id="component-type" value={type} onChange={(e) => setType(e.target.value)} />
              </Field>
              <Field id="component-serial" label="Serial number">
                <Input
                  id="component-serial"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </Field>
              <Field id="component-dom" label="Date of manufacture">
                <Input
                  id="component-dom"
                  type="date"
                  value={dom}
                  onChange={(e) => setDom(e.target.value)}
                />
              </Field>
            </div>
          )}
          {save.isError && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={save.isPending || (mode === 'existing' ? !gearId : !name.trim())}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
