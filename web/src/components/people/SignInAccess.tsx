import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ME_KEY, useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { fullName } from '@/components/people/ContactLinks';
import { formatDateTime, SignInLinkDialog } from '@/components/people/SignInLinkDialog';
import { KeyRound, LogOut, ShieldCheck, ShieldOff, Unlock } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
      {isLocked(person) && (
        <Badge className="bg-destructive/15 text-destructive">
          Locked until {formatDateTime(person.lockedUntil!)}
        </Badge>
      )}
    </>
  );
}

/** Cooling down after too many wrong passwords or codes. */
export const isLocked = (p: Person) =>
  !!p.lockedUntil && new Date(p.lockedUntil).getTime() > Date.now();

/**
 * "Last signed in Mar 4, 2026 · 3 sign-ins · authenticator on", or "Never signed in", and
 * "no password yet" (admins see this).
 */
export function lastSignInText(p: Person): string {
  const parts: string[] = [];
  if (!p.lastLoginAt) parts.push('Never signed in');
  else {
    const n = p.loginCount ?? 0;
    parts.push(
      `Last signed in ${formatDate(p.lastLoginAt)}`,
      `${n} ${n === 1 ? 'sign-in' : 'sign-ins'}`,
    );
  }
  if (p.hasPassword === false) parts.push('no password yet');
  if (p.totpEnabled) parts.push('authenticator on');
  return parts.join(' · ');
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
        description="A person needs an email address to sign in. Once they have access, send them a password link (⋯ → Get password link) to set their password. No email is sent."
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
 * Admin sign-in actions for people: change access, get a password link, unlock, reset the
 * authenticator, sign out everywhere. Render `menuItems(p)` in a person's menu and `dialogs`
 * once.
 */
export function useSignInActions() {
  const qc = useQueryClient();
  const [access, setAccess] = useState<Person | null>(null);
  const [link, setLink] = useState<{ name: string; phone?: string; info: SignInLink } | null>(null);
  const [signingOut, setSigningOut] = useState<Person | null>(null);
  const [resetting, setResetting] = useState<Person | null>(null);

  const unlock = useMutation({
    mutationFn: (p: Person) => api(`/auth/people/${p.id}/unlock`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.people }),
  });

  const getLink = useMutation({
    mutationFn: (p: Person) => api<SignInLink>(`/auth/people/${p.id}/link`, { method: 'POST' }),
    onSuccess: (info, p) => setLink({ name: fullName(p), phone: p.phone || undefined, info }),
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
          `${fullName(signingOut)} is signed out on every phone and computer. They can sign in again with their password (or a new password link).`
        }
        confirmLabel="Sign out everywhere"
        onConfirm={async () => {
          if (!signingOut) return;
          await api(`/auth/people/${signingOut.id}/sign-out`, { method: 'POST' });
          await qc.invalidateQueries({ queryKey: keys.people });
        }}
      />
      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        title="Reset authenticator?"
        description={
          resetting &&
          `Turns off authenticator codes for ${fullName(resetting)} (for a lost phone) and signs them out everywhere. They sign in with their password and can set up codes again on Account.`
        }
        confirmLabel="Reset authenticator"
        onConfirm={async () => {
          if (!resetting) return;
          await api(`/auth/people/${resetting.id}/reset-authenticator`, { method: 'POST' });
          await qc.invalidateQueries({ queryKey: keys.people });
        }}
      />
    </>
  );

  /** The admin's sign-in items for a person's ⋯ menu. */
  const menuItems = (p: Person) => (
    <>
      <DropdownMenuItem onSelect={() => setAccess(p)}>
        <ShieldCheck /> Sign-in access…
      </DropdownMenuItem>
      {canSignIn(p) && (
        <>
          <DropdownMenuItem disabled={getLink.isPending} onSelect={() => getLink.mutate(p)}>
            <KeyRound /> Get password link
          </DropdownMenuItem>
          {isLocked(p) && (
            <DropdownMenuItem disabled={unlock.isPending} onSelect={() => unlock.mutate(p)}>
              <Unlock /> Unlock account
            </DropdownMenuItem>
          )}
          {p.totpEnabled && (
            <DropdownMenuItem onSelect={() => setResetting(p)}>
              <ShieldOff /> Reset authenticator
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setSigningOut(p)}>
            <LogOut /> Sign out everywhere
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  return {
    editAccess: (p: Person) => setAccess(p),
    getLink: (p: Person) => getLink.mutate(p),
    linkPending: getLink.isPending,
    signOut: (p: Person) => setSigningOut(p),
    menuItems,
    error: getLink.isError
      ? accessError(getLink.error)
      : unlock.isError
        ? accessError(unlock.error)
        : null,
    dialogs,
  };
}
