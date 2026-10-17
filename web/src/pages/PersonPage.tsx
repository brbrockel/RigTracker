import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  KeyRound,
  Link2Off,
  LogOut,
  Package,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { RowMenu } from '@/components/RowMenu';
import { Thumb } from '@/components/Thumb';
import { addressLine, ContactLinks, fullName } from '@/components/people/ContactLinks';
import { PersonDialog } from '@/components/people/PersonDialog';
import { AccessBadges, lastSignInText, useSignInActions } from '@/components/people/SignInAccess';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/input';
import {
  api,
  ApiError,
  canDelete,
  canSignIn,
  canWrite,
  errorMessage,
  formatDate,
  rigLabel,
  type Gear,
  type Person,
  type Rig,
} from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import { keys, usePeople, usePerson, useGear, useRigs } from '@/lib/queries';

export function PersonPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useUser();
  const qc = useQueryClient();
  const person = usePerson(id);
  const rigs = useRigs();
  const gear = useGear();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState<Gear | null>(null);
  const signIn = useSignInActions();

  const rigById = useMemo(
    () => new Map((rigs.data ?? []).map((r) => [r._id, r] as const)),
    [rigs.data],
  );
  const myRigs = (rigs.data ?? []).filter((r) => r.primaryUserId === id);
  const myGear = (gear.data ?? []).filter((g) => g.assignedPersonId === id);

  const remove = useMutation({
    mutationFn: () => api(`/people/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.people });
      navigate('/people', { replace: true });
    },
  });
  const unassign = useMutation({
    mutationFn: (g: Gear) =>
      api(`/gear/${g._id}`, {
        method: 'PUT',
        body: { assignedRigId: null, assignedPersonId: null },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.gear }),
  });

  const back = (
    <Link
      to="/people"
      className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> People
    </Link>
  );

  if (person.isError) {
    const missing = person.error instanceof ApiError && person.error.status === 404;
    return (
      <div className="flex flex-col gap-5">
        {back}
        {missing ? (
          <>
            <PageHeader title="Person not found" />
            <p className="text-sm text-muted-foreground">
              They may have been deleted. Go back to People to find someone else.
            </p>
          </>
        ) : (
          <Alert variant="destructive">{errorMessage(person.error)}</Alert>
        )}
      </div>
    );
  }
  if (!person.data)
    return (
      <div className="flex flex-col gap-5">
        {back}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );

  const p = person.data;
  const name = fullName(p);
  const writer = canWrite(user);
  const admin = canDelete(user);
  const isSelf = p._id === user?.id;
  const address = addressLine(p.address);
  const contacts = (p.emergencyContacts ?? []).filter((c) => c.name || c.phone);

  return (
    <div className="flex flex-col gap-5">
      {back}
      <PageHeader
        title={name}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <AccessBadges person={p} isSelf={isSelf} />
            {!p.roles?.length && admin && <span>No sign-in</span>}
            {admin && !!p.roles?.length && <span className="text-xs">{lastSignInText(p)}</span>}
          </span>
        }
        action={
          (writer || admin) && (
            <>
              {writer && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
              )}
              {admin && (
                <RowMenu label={name}>
                  <DropdownMenuItem onSelect={() => signIn.editAccess(p)}>
                    <ShieldCheck /> Sign-in access…
                  </DropdownMenuItem>
                  {canSignIn(p) && (
                    <>
                      <DropdownMenuItem
                        disabled={signIn.linkPending}
                        onSelect={() => signIn.getLink(p)}
                      >
                        <KeyRound /> Get sign-in link
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => signIn.signOut(p)}>
                        <LogOut /> Sign out everywhere
                      </DropdownMenuItem>
                    </>
                  )}
                </RowMenu>
              )}
              {admin && !isSelf && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 text-destructive"
                  aria-label={`Delete ${name}`}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 />
                </Button>
              )}
            </>
          )
        }
      />

      {signIn.error && <Alert variant="destructive">{signIn.error}</Alert>}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <ContactLinks email={p.email} phone={p.phone} address={address} />
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Date of birth</dt>
              <dd>{formatDate(p.dob) || '—'}</dd>
            </div>
            {!address && (
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd>—</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Emergency contacts</h2>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">None on file.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {contacts.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name || 'Unnamed'}</div>
                      <div className="text-sm text-muted-foreground">
                        {[c.relation, formatPhone(c.phone)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {c.phone && (
                      <Button asChild variant="outline" size="icon" className="size-11">
                        <a href={`tel:${c.phone}`} aria-label={`Call ${c.name || formatPhone(c.phone)}`}>
                          <Phone />
                        </a>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-5 text-primary" aria-hidden /> Rigs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rigs.isError && <Alert variant="destructive">{errorMessage(rigs.error)}</Alert>}
          {rigs.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : myRigs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not the primary user of any rig.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {myRigs.map((r) => (
                <li key={r._id}>
                  <Link
                    to={`/rigs/${r._id}`}
                    className="flex min-h-11 items-center gap-3 rounded-lg p-2 hover:bg-accent"
                  >
                    <Thumb url={r.imageUrl} alt={rigLabel(r)} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{rigLabel(r)}</div>
                      {r.repackDue && (
                        <div className="text-sm text-muted-foreground">
                          Repack due {formatDate(r.repackDue)}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5 text-primary" aria-hidden /> Gear
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Gear given to them directly, and gear on rigs they're the primary user of.
            </p>
          </div>
          {writer && (
            <Button size="sm" variant="outline" className="h-11" onClick={() => setAssigning(true)}>
              <Plus /> Assign gear
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {gear.isError && <Alert variant="destructive">{errorMessage(gear.error)}</Alert>}
          {gear.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : myGear.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gear assigned.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {myGear.map((g) => {
                const rig = g.assignedRigId ? rigById.get(g.assignedRigId) : undefined;
                return (
                  <li key={g._id} className="flex items-center gap-3 rounded-lg border p-2">
                    <Thumb url={g.imageUrl} alt={g.name || 'Gear'} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{g.name || 'Unnamed gear'}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                        {g.assignedRigId ? (
                          <Badge>Via rig: {rig ? rigLabel(rig) : 'unknown rig'}</Badge>
                        ) : (
                          <Badge>Direct</Badge>
                        )}
                        {[g.type, g.serialNumber && `SN ${g.serialNumber}`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {writer && (
                      <RowMenu label={g.name || 'gear'}>
                        <DropdownMenuItem onSelect={() => setUnassigning(g)}>
                          <Link2Off /> Unassign
                        </DropdownMenuItem>
                      </RowMenu>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && <PersonDialog person={p} onClose={() => setEditing(false)} />}
      {signIn.dialogs}
      {assigning && (
        <AssignGearDialog
          person={p}
          gear={gear.data ?? []}
          rigById={rigById}
          onClose={() => setAssigning(false)}
        />
      )}
      <ConfirmDialog
        open={!!unassigning}
        onOpenChange={(o) => !o && setUnassigning(null)}
        title={`Unassign ${unassigning?.name || 'this gear'}?`}
        description={
          unassigning?.assignedRigId
            ? `It's on a rig ${name} uses; unassigning takes it off that rig too.`
            : `It won't be assigned to ${name} any more.`
        }
        confirmLabel="Unassign"
        onConfirm={() => unassign.mutateAsync(unassigning!)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${name}?`}
        description="This can't be undone."
        onConfirm={() => remove.mutateAsync()}
      />
    </div>
  );
}

function AssignGearDialog({
  person,
  gear,
  rigById,
  onClose,
}: {
  person: Person;
  gear: Gear[];
  rigById: Map<string, Rig>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const people = usePeople();
  const [gearId, setGearId] = useState('');
  const free = gear.filter((g) => !g.assignedRigId && !g.assignedPersonId);
  const elsewhere = gear.filter(
    (g) => (g.assignedRigId || g.assignedPersonId) && g.assignedPersonId !== person._id,
  );
  const picked = gear.find((g) => g._id === gearId);
  const holder = (g: Gear) => {
    if (g.assignedRigId) {
      const r = rigById.get(g.assignedRigId);
      return `on ${r ? rigLabel(r) : 'a rig'}`;
    }
    const p = people.data?.find((x) => x._id === g.assignedPersonId);
    return `with ${p ? fullName(p) : 'someone else'}`;
  };
  const label = (g: Gear) =>
    [g.name || 'Unnamed gear', g.type, g.serialNumber && `SN ${g.serialNumber}`]
      .filter(Boolean)
      .join(' · ');

  const assign = useMutation({
    mutationFn: () =>
      api(`/gear/${gearId}`, {
        method: 'PUT',
        body: { assignedRigId: null, assignedPersonId: person._id },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.gear });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (gearId) assign.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Assign gear" description={`Give a piece of gear to ${fullName(person)}.`}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id="assign-gear" label="Gear">
            <Select id="assign-gear" value={gearId} onChange={(e) => setGearId(e.target.value)}>
              <option value="">Choose gear…</option>
              <optgroup label="Unassigned">
                {free.map((g) => (
                  <option key={g._id} value={g._id}>
                    {label(g)}
                  </option>
                ))}
              </optgroup>
              {elsewhere.length > 0 && (
                <optgroup label="Assigned elsewhere">
                  {elsewhere.map((g) => (
                    <option key={g._id} value={g._id}>
                      {label(g)} ({holder(g)})
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>
          {free.length === 0 && elsewhere.length === 0 && (
            <p className="text-sm text-muted-foreground">There's no other gear to assign.</p>
          )}
          {picked && (picked.assignedRigId || picked.assignedPersonId) && (
            <Alert>
              This gear is {holder(picked)}. Assigning it to {fullName(person)} takes it off
              {picked.assignedRigId ? ' that rig' : ' them'}.
            </Alert>
          )}
          {assign.isError && <Alert variant="destructive">{errorMessage(assign.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!gearId || assign.isPending}>
              {assign.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
