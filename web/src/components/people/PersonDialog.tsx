import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type ComponentProps, type FormEvent } from 'react';
import { ME_KEY, useUser } from '@/auth/session';
import { Field } from '@/components/Field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, canSignIn, dateInputValue, errorMessage, type Person } from '@/lib/api';
import { keys } from '@/lib/queries';
import { formatPhone, isEmail, normalizePhone, PHONE_HINT } from '@/lib/phone';

type Contact = { name: string; phone: string; relation: string };

interface Draft {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  contacts: Contact[];
}

function draftOf(p?: Person | null): Draft {
  return {
    firstName: p?.firstName ?? '',
    middleName: p?.middleName ?? '',
    lastName: p?.lastName ?? '',
    email: p?.email ?? '',
    phone: formatPhone(p?.phone),
    dob: dateInputValue(p?.dob),
    line1: p?.address?.line1 ?? '',
    line2: p?.address?.line2 ?? '',
    city: p?.address?.city ?? '',
    state: p?.address?.state ?? '',
    zip: p?.address?.zip ?? '',
    contacts: (p?.emergencyContacts ?? []).map((c) => ({
      name: c.name ?? '',
      phone: formatPhone(c.phone),
      relation: c.relation ?? '',
    })),
  };
}

type Errors = Partial<Record<'firstName' | 'lastName' | 'email' | 'phone', string>> & {
  contacts?: Record<number, string>;
};

/** Checks the form; returns the request body, or the problems to show. */
function validate(
  d: Draft,
  needsEmail: boolean,
): { body?: Record<string, unknown>; errors: Errors } {
  const errors: Errors = {};
  if (!d.firstName.trim()) errors.firstName = 'Enter a first name';
  const email = d.email.trim().toLowerCase();
  if (!email && needsEmail) errors.email = 'Enter an email address. They use it to sign in.';
  else if (email && !isEmail(email)) errors.email = 'Enter a valid email';
  const phone = normalizePhone(d.phone);
  if (d.phone.trim() && !phone) errors.phone = PHONE_HINT;

  const contacts: Array<{ name: string; phone: string; relation: string }> = [];
  d.contacts.forEach((c, i) => {
    if (!c.name.trim() && !c.phone.trim() && !c.relation.trim()) return; // blank row: dropped
    const cp = normalizePhone(c.phone);
    if (c.phone.trim() && !cp) {
      errors.contacts = { ...errors.contacts, [i]: PHONE_HINT };
      return;
    }
    contacts.push({ name: c.name.trim(), phone: cp ?? '', relation: c.relation.trim() });
  });

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    body: {
      firstName: d.firstName.trim(),
      middleName: d.middleName.trim(),
      lastName: d.lastName.trim(),
      email,
      phone: phone ?? '',
      dob: d.dob || null,
      address: {
        line1: d.line1.trim(),
        line2: d.line2.trim(),
        city: d.city.trim(),
        state: d.state.trim(),
        zip: d.zip.trim(),
      },
      emergencyContacts: contacts,
    },
  };
}

const Err = ({ id, msg }: { id: string; msg?: string }) =>
  msg ? (
    <p id={id} className="text-xs text-destructive">
      {msg}
    </p>
  ) : null;

/** New or edit person form. Mount it only while open so it starts from the record. */
export function PersonDialog({
  person,
  onClose,
  onSaved,
}: {
  person?: Person | null;
  onClose: () => void;
  onSaved?: (p: Person) => void;
}) {
  const qc = useQueryClient();
  const me = useUser();
  const signsIn = canSignIn(person);
  const [d, setD] = useState<Draft>(() => draftOf(person));
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof Omit<Draft, 'contacts'>) => (e: { target: { value: string } }) =>
    setD((cur) => ({ ...cur, [k]: e.target.value }));
  const setContact = (i: number, k: keyof Contact, v: string) =>
    setD((cur) => ({
      ...cur,
      contacts: cur.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)),
    }));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      person
        ? api<Person>(`/people/${person.id}`, { method: 'PUT', body })
        : api<Person>('/people', { method: 'POST', body }),
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: keys.people });
      // Your own name shows in the account menu.
      if (person && person.id === me?.id) await qc.invalidateQueries({ queryKey: ME_KEY });
      onSaved?.(saved);
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const { body, errors } = validate(d, signsIn);
    setErrors(errors);
    if (body) save.mutate(body);
  }

  const input = (
    id: string,
    k: keyof Omit<Draft, 'contacts'>,
    props: ComponentProps<typeof Input> = {},
  ) => <Input id={id} value={d[k]} onChange={set(k)} {...props} />;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={person ? 'Edit person' : 'New person'}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="p-first" label="First name">
              {input('p-first', 'firstName', {
                autoComplete: 'given-name',
                'aria-invalid': !!errors.firstName,
                'aria-describedby': errors.firstName ? 'p-first-err' : undefined,
              })}
              <Err id="p-first-err" msg={errors.firstName} />
            </Field>
            <Field id="p-middle" label="Middle name">
              {input('p-middle', 'middleName', { autoComplete: 'additional-name' })}
            </Field>
            <Field id="p-last" label="Last name">
              {input('p-last', 'lastName', {
                autoComplete: 'family-name',
                'aria-invalid': !!errors.lastName,
                'aria-describedby': errors.lastName ? 'p-last-err' : undefined,
              })}
              <Err id="p-last-err" msg={errors.lastName} />
            </Field>
          </div>
          <Field id="p-email" label="Email" hint={signsIn ? 'Used to sign in' : undefined}>
            {input('p-email', 'email', {
              required: signsIn,
              type: 'email',
              inputMode: 'email',
              autoCapitalize: 'none',
              autoComplete: 'email',
              'aria-invalid': !!errors.email,
              'aria-describedby': errors.email ? 'p-email-err' : undefined,
            })}
            <Err id="p-email-err" msg={errors.email} />
          </Field>
          <Field id="p-phone" label="Phone">
            {input('p-phone', 'phone', {
              type: 'tel',
              inputMode: 'tel',
              autoComplete: 'tel',
              placeholder: '(860) 555-1234',
              'aria-invalid': !!errors.phone,
              'aria-describedby': errors.phone ? 'p-phone-err' : undefined,
            })}
            <Err id="p-phone-err" msg={errors.phone} />
          </Field>
          <Field id="p-dob" label="Date of birth">
            {input('p-dob', 'dob', { type: 'date' })}
          </Field>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Address</legend>
            <Input
              aria-label="Address line 1"
              placeholder="Street"
              autoComplete="address-line1"
              value={d.line1}
              onChange={set('line1')}
            />
            <Input
              aria-label="Address line 2"
              placeholder="Apt, unit (optional)"
              autoComplete="address-line2"
              value={d.line2}
              onChange={set('line2')}
            />
            <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
              <Input
                aria-label="City"
                placeholder="City"
                autoComplete="address-level2"
                value={d.city}
                onChange={set('city')}
              />
              <Input
                aria-label="State"
                placeholder="State"
                autoComplete="address-level1"
                value={d.state}
                onChange={set('state')}
              />
              <Input
                aria-label="ZIP"
                placeholder="ZIP"
                inputMode="numeric"
                autoComplete="postal-code"
                value={d.zip}
                onChange={set('zip')}
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Emergency contacts</legend>
            {d.contacts.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            {d.contacts.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Contact ${i + 1} name`}
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) => setContact(i, 'name', e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={`Remove contact ${i + 1}`}
                    onClick={() =>
                      setD((cur) => ({ ...cur, contacts: cur.contacts.filter((_, j) => j !== i) }))
                    }
                  >
                    <X />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label={`Contact ${i + 1} phone`}
                    placeholder="Phone"
                    type="tel"
                    inputMode="tel"
                    value={c.phone}
                    aria-invalid={!!errors.contacts?.[i]}
                    onChange={(e) => setContact(i, 'phone', e.target.value)}
                  />
                  <Input
                    aria-label={`Contact ${i + 1} relation`}
                    placeholder="Relation, e.g. Spouse"
                    value={c.relation}
                    onChange={(e) => setContact(i, 'relation', e.target.value)}
                  />
                </div>
                <Err id={`p-contact-${i}-err`} msg={errors.contacts?.[i]} />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                setD((cur) => ({
                  ...cur,
                  contacts: [...cur.contacts, { name: '', phone: '', relation: '' }],
                }))
              }
            >
              <Plus /> Add contact
            </Button>
          </fieldset>

          {save.isError && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
