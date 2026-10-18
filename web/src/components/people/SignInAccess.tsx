import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ME_KEY, useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { fullName } from '@/components/people/ContactLinks';
import { SignInLinkDialog } from '@/components/people/SignInLinkDialog';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import {
  api,
  ApiError,
  canSignIn,
  errorMessage,
  formatDate,
  roleLabel,
  type Person,
  type Role,
  type SignInLink,
} from '@/lib/api';
import { keys } from '@/lib/queries';

/** The API's own words for access errors (e.g. "You cannot remove your own admin role"). */
function accessError(err: unknown): string {
  if (err instanceof ApiError && err.status !== 401 && err.message && !/csrf/i.test(err.message))
    return err.message;
  return errorMessage(err);
}

/** Role and "You" badges for a person's card or header. */
export function AccessBadges({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const label = roleLabel(person);
  return (
    <>
      {isSelf && <Badge>You</Badge>}
      {canSignIn(person) && (
        <Badge className={label === 'Admin' ? 'bg-primary/15 text-primary' : undefined}>
          {label}
        </Badge>
      )}
      {!!person.roles?.length && person.isActive === false && (
        <Badge className="bg-destructive/15 text-destructive">Sign-in off</Badge>
      )}
    </>
  );
}

/** "Last signed in Mar 4, 2026 · 3 sign-ins" or "Never signed in" (admins see this). */
export function lastSignInText(p: Person): string {
  if (!p.lastLoginAt) return 'Never signed in';
  const n = p.loginCount ?? 0;
  return `Last signed in ${formatDate(p.lastLoginAt)} · ${n} ${n === 1 ? 'sign-in' : 'sign-ins'}`;
}

type Choice = 'none' | Role;

const currentChoice = (p: Person): Choice => {
  const r = p.roles ?? [];
  return r.includes('admin')
    ? 'admin'
    : r.includes('user')
      ? 'user'
      : r.includes('viewer')
        ? 'viewer'
        : 'none';
};

function AccessDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const me = useUser();
  const qc = useQueryClient();
  const isSelf = person.id === me?.id;
  const current = currentChoice(person);
  const [choice, setChoice] = useState<Choice>(current);
  // An admin can't remove their own admin role (the API refuses it too).
  const lockedAdmin = isSelf && current === 'admin';
  const name = fullName(person);

  const save = useMutation({
    mutationFn: () =>
      api<Person>(`/auth/people/${person.id}/access`, {
        method: 'PATCH',
        body: { role: choice === 'none' ? null : choice },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.people });
      if (isSelf) await qc.invalidateQueries({ queryKey: ME_KEY });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Sign-in access for ${name}`}
        description="A person needs an email address to sign in. Once they have access, send them a sign-in link (⋯ → Get sign-in link). No email is sent."
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id="access-role" label="Access">
            <Select
              id="access-role"
              value={choice}
              onChange={(e) => setChoice(e.target.value as Choice)}
            >
              <option value="none" disabled={lockedAdmin}>
                No sign-in
              </option>
              <option value="viewer" disabled={lockedAdmin}>
                Viewer (can look)
              </option>
              <option value="user" disabled={lockedAdmin}>
                User (can add and change)
              </option>
              <option value="admin">
                Admin (everything, including people's private details and sign-in)
              </option>
            </Select>
          </Field>
          {lockedAdmin && (
            <p className="text-sm text-muted-foreground">
              You can't remove your own admin role. Ask another admin.
            </p>
          )}
          {choice !== 'none' && !person.email && (
            <p className="text-sm text-muted-foreground">
              {name} has no email address yet. Edit them to add one first.
            </p>
          )}
          {current !== 'none' && choice === 'none' && (
            <p className="text-sm text-muted-foreground">
              They'll be signed out on every phone and computer.
            </p>
          )}
          {save.isError && <Alert variant="destructive">{accessError(save.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || choice === current}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Admin sign-in actions for people: change access, get a sign-in link, sign out everywhere.
 * Call the returned functions from menu items or buttons and render `dialogs` once.
 */
export function useSignInActions() {
  const qc = useQueryClient();
  const [access, setAccess] = useState<Person | null>(null);
  const [link, setLink] = useState<{ name: string; info: SignInLink } | null>(null);
  const [signingOut, setSigningOut] = useState<Person | null>(null);

  const getLink = useMutation({
    mutationFn: (p: Person) => api<SignInLink>(`/auth/people/${p.id}/link`, { method: 'POST' }),
    onSuccess: (info, p) => setLink({ name: fullName(p), info }),
  });

  const dialogs = (
    <>
      {access && <AccessDialog person={access} onClose={() => setAccess(null)} />}
      {link && <SignInLinkDialog {...link} onClose={() => setLink(null)} />}
      <ConfirmDialog
        open={!!signingOut}
        onOpenChange={(open) => !open && setSigningOut(null)}
        title="Sign out everywhere?"
        description={
          signingOut &&
          `${fullName(signingOut)} is signed out on every phone and computer. They need a new sign-in link to get back in.`
        }
        confirmLabel="Sign out everywhere"
        onConfirm={async () => {
          if (!signingOut) return;
          await api(`/auth/people/${signingOut.id}/sign-out`, { method: 'POST' });
          await qc.invalidateQueries({ queryKey: keys.people });
        }}
      />
    </>
  );

  return {
    editAccess: (p: Person) => setAccess(p),
    getLink: (p: Person) => getLink.mutate(p),
    linkPending: getLink.isPending,
    signOut: (p: Person) => setSigningOut(p),
    error: getLink.isError ? accessError(getLink.error) : null,
    dialogs,
  };
}
