import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Field } from '@/components/Field';
import { MediaPicker } from '@/components/MediaPicker';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api, dateInputValue, errorMessage, personName, type Rig } from '@/lib/api';
import { keys, usePeople } from '@/lib/queries';

const TEXT = [
  'name',
  'number',
  'container',
  'containerSerialNumber',
  'mainSize',
  'mainSerialNumber',
  'reserveSize',
  'reserveSerialNumber',
  'aadType',
  'aadSerialNumber',
  'riggerINT',
  'notes',
] as const;
const DATES = [
  'containerDOM',
  'mainDOM',
  'reserveDOM',
  'aadDOM',
  'lastPacked',
  'repackDue',
] as const;

type Key = (typeof TEXT)[number] | (typeof DATES)[number] | 'primaryUserId';
type Values = Record<Key, string>;

function initialValues(rig?: Rig | null): Values {
  const v = {} as Values;
  for (const k of TEXT) v[k] = rig?.[k] ?? '';
  for (const k of DATES) v[k] = dateInputValue(rig?.[k]);
  v.primaryUserId = rig?.primaryUserId ?? '';
  return v;
}

/**
 * The request body. New rigs leave blank fields out; edits send null for a blank field so it's
 * cleared (dates arrive as yyyy-mm-dd; the API stores them as dates).
 */
function rigBody(values: Values, imageUrl: string | undefined, editing: boolean) {
  const body: Record<string, string | null> = {};
  const keysToSend: Key[] = [...TEXT, ...DATES, 'primaryUserId'];
  for (const k of keysToSend) {
    const value = values[k].trim();
    if (value) body[k] = value;
    else if (editing) body[k] = null;
  }
  if (imageUrl) body.imageUrl = imageUrl;
  else if (editing) body.imageUrl = null;
  return body;
}

/** New / edit rig form. Pass rig to edit; null or undefined to add a new one. */
export function RigDialog({
  open,
  onOpenChange,
  rig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rig?: Rig | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={rig ? 'Edit rig' : 'New rig'}
        description={
          rig ? undefined : 'Only the name is required; fill in the rest as you know it.'
        }
        className="sm:max-w-2xl"
      >
        {/* Keyed so the form starts fresh each time it opens. */}
        {open && <RigForm key={rig?.id ?? 'new'} rig={rig} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RigForm({ rig, onDone }: { rig?: Rig | null; onDone: () => void }) {
  const qc = useQueryClient();
  const people = usePeople();
  const [values, setValues] = useState<Values>(() => initialValues(rig));
  const [imageUrl, setImageUrl] = useState<string | undefined>(rig?.imageUrl || undefined);

  const save = useMutation({
    mutationFn: () => {
      const body = rigBody(values, imageUrl, !!rig);
      return rig
        ? api<Rig>(`/rigs/${rig.id}`, { method: 'PUT', body })
        : api<Rig>('/rigs', { method: 'POST', body });
    },
    onSuccess: async () => {
      // A new primary person also moves the rig's gear to them.
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.rigs }),
        qc.invalidateQueries({ queryKey: keys.gear }),
      ]);
      onDone();
    },
  });

  const set = (k: Key) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  const text = (k: Key, label: string, extra?: { required?: boolean; placeholder?: string }) => (
    <Field id={`rig-${k}`} label={label}>
      <Input id={`rig-${k}`} value={values[k]} onChange={set(k)} {...extra} />
    </Field>
  );
  const date = (k: Key, label: string) => (
    <Field id={`rig-${k}`} label={label}>
      <Input id={`rig-${k}`} type="date" value={values[k]} onChange={set(k)} />
    </Field>
  );

  const sortedPeople = [...(people.data ?? [])].sort((a, b) =>
    personName(a).localeCompare(personName(b)),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Section title="Rig">
        {text('name', 'Name', { required: true })}
        {text('number', 'Number')}
        <Field
          id="rig-primaryUserId"
          label="Primary person"
          hint="Gear on this rig goes with them."
        >
          <Select
            id="rig-primaryUserId"
            value={values.primaryUserId}
            onChange={set('primaryUserId')}
          >
            <option value="">No one</option>
            {sortedPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p) || p.email || 'Unnamed person'}
              </option>
            ))}
          </Select>
        </Field>
      </Section>
      <Section title="Container">
        {text('container', 'Container')}
        {text('containerSerialNumber', 'Serial number')}
        {date('containerDOM', 'Date of manufacture')}
      </Section>
      <Section title="Main">
        {text('mainSize', 'Size')}
        {text('mainSerialNumber', 'Serial number')}
        {date('mainDOM', 'Date of manufacture')}
      </Section>
      <Section title="Reserve">
        {text('reserveSize', 'Size')}
        {text('reserveSerialNumber', 'Serial number')}
        {date('reserveDOM', 'Date of manufacture')}
      </Section>
      <Section title="AAD">
        {text('aadType', 'Type')}
        {text('aadSerialNumber', 'Serial number')}
        {date('aadDOM', 'Date of manufacture')}
      </Section>
      <Section title="Packing">
        {date('lastPacked', 'Last packed')}
        {date('repackDue', 'Repack due')}
        {text('riggerINT', 'Rigger initials')}
      </Section>

      <Field id="rig-notes" label="Notes">
        <textarea
          id="rig-notes"
          rows={3}
          value={values.notes}
          onChange={set('notes')}
          className="w-full rounded-lg border bg-card px-3 py-2 text-base shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
      </Field>
      <MediaPicker
        value={imageUrl}
        onChange={setImageUrl}
        folder={`rigs/${values.name.trim() || 'uncategorized'}`}
      />

      {save.isError && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !values.name.trim()}>
          {save.isPending ? 'Saving…' : rig ? 'Save' : 'Add rig'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
