import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Field } from '@/components/Field';
import { PendingMedia } from '@/components/media/PendingMedia';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api, dateInputValue, errorMessage, personName, uploadAll, type Rig } from '@/lib/api';
import { keys, usePeople } from '@/lib/queries';

// The container, main, reserve and AAD are gear, set on the rig's page (Components).
const TEXT = ['name', 'number', 'riggerINT', 'notes'] as const;
const DATES = ['lastPacked', 'repackDue'] as const;

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
function rigBody(values: Values, editing: boolean) {
  const body: Record<string, string | null> = {};
  const keysToSend: Key[] = [...TEXT, ...DATES, 'primaryUserId'];
  for (const k of keysToSend) {
    const value = values[k].trim();
    if (value) body[k] = value;
    else if (editing) body[k] = null;
  }
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
          rig
            ? 'Its container, main, reserve and AAD, and its photos, are on the rig’s page.'
            : 'Only the name is required. Add its container, main, reserve and AAD on the rig’s page.'
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
  const [pending, setPending] = useState<File[]>([]);
  const [progress, setProgress] = useState('');
  // A new rig whose photos didn't all upload: saving again updates it instead of adding another.
  const [created, setCreated] = useState<Rig | null>(null);
  const saved = rig ?? created;

  const refresh = () =>
    // A new primary person also moves the rig's gear to them.
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.rigs }),
      qc.invalidateQueries({ queryKey: keys.gear }),
    ]);
  const save = useMutation({
    mutationFn: async () => {
      const body = rigBody(values, !!saved);
      if (saved) return api<Rig>(`/rigs/${saved.id}`, { method: 'PUT', body });
      setProgress('Saving…');
      const item = await api<Rig>('/rigs', { method: 'POST', body });
      if (pending.length) {
        setCreated(item);
        const { failed } = await uploadAll('rig', item.id, pending, setProgress);
        setPending([]);
        if (failed.length)
          throw new Error(
            `The rig was added, but some files didn't upload. ${failed.join('; ')} Add them on the rig's page.`,
          );
      }
      return item;
    },
    onSuccess: async () => {
      await refresh();
      onDone();
    },
    // A new rig may have been added before an upload failed.
    onError: () => refresh(),
    onSettled: () => setProgress(''),
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
      {!saved && <PendingMedia files={pending} onChange={setPending} disabled={save.isPending} />}

      {save.isError && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !values.name.trim()}>
          {save.isPending ? progress || 'Saving…' : saved ? 'Save' : 'Add rig'}
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
