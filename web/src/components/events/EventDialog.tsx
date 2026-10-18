import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Field } from '@/components/Field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, dateInputValue, errorMessage, type RigEvent } from '@/lib/api';
import { keys } from '@/lib/queries';

const today = () => new Date().toISOString().slice(0, 10);

/** New or edit event details (name, date, description). Mount it only while open. */
export function EventDialog({
  event,
  onClose,
  onSaved,
}: {
  event?: RigEvent | null;
  onClose: () => void;
  onSaved?: (e: RigEvent) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(event?.name ?? '');
  const [date, setDate] = useState(event ? dateInputValue(event.eventDate) : today());
  const [description, setDescription] = useState(event?.description ?? '');
  const [problem, setProblem] = useState('');

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      event
        ? api<RigEvent>(`/events/${event._id}`, { method: 'PUT', body })
        : api<RigEvent>('/events', { method: 'POST', body }),
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: keys.events });
      onClose();
      onSaved?.(saved);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setProblem('Enter a name for the event.');
    if (!date) return setProblem('Choose the date.');
    setProblem('');
    // A plain yyyy-mm-dd is stored as midnight UTC, which formatDate shows as that same day.
    save.mutate({ name: name.trim(), eventDate: date, description: description.trim() });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={event ? 'Edit event' : 'New event'}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field id="ev-name" label="Name">
            <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="ev-date" label="Date">
            <Input
              id="ev-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field id="ev-desc" label="Description">
            <textarea
              id="ev-desc"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border bg-card px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            />
          </Field>
          {problem && <Alert variant="destructive">{problem}</Alert>}
          {save.isError && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : event ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
