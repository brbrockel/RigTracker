import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, ShieldCheck, UserPlus, UserRoundCheck } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { RowMenu } from '@/components/RowMenu';
import { SignInLinkDialog } from '@/components/users/SignInLinkDialog';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import {
  api,
  ApiError,
  errorMessage,
  formatDate,
  isAdmin,
  type SignInLink,
  type User,
} from '@/lib/api';
import { keys, useUsers } from '@/lib/queries';
import { cn } from '@/lib/utils';

const userName = (u: User) => u.displayName || u.email;

export function UsersPage() {
  const me = useUser();
  const users = useUsers();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'admin' | 'user' | 'inactive'>('');
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<{ name: string; info: SignInLink } | null>(null);
  const [signingOut, setSigningOut] = useState<User | null>(null);
  const qc = useQueryClient();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users.data ?? [])
      .filter(
        (u) =>
          (!q || u.email.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q)) &&
          (roleFilter === ''
            ? true
            : roleFilter === 'inactive'
              ? !u.isActive
              : roleFilter === 'admin'
                ? isAdmin(u)
                : !isAdmin(u)),
      )
      .sort((a, b) => userName(a).localeCompare(userName(b)));
  }, [users.data, search, roleFilter]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Users and sign-in"
        subtitle="Only people added here can sign in. Each sign-in link works once and lasts 72 hours."
        action={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add person
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          aria-label="Search users"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Filter by role"
          className="sm:w-48"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
        >
          <option value="">Everyone</option>
          <option value="admin">Admins</option>
          <option value="user">Users</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>

      {users.isError && <Alert variant="destructive">{errorMessage(users.error)}</Alert>}
      {users.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="flex flex-col gap-3">
        {shown.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            isSelf={u.id === me?.id}
            onLink={(info) => setLink({ name: userName(u), info })}
            onSignOut={() => setSigningOut(u)}
          />
        ))}
        {users.data && shown.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {users.data.length === 0 ? 'No one has been added yet.' : 'No one matches.'}
          </p>
        )}
      </div>

      <AddPersonDialog open={adding} onOpenChange={setAdding} />
      {link && <SignInLinkDialog {...link} onClose={() => setLink(null)} />}
      <ConfirmDialog
        open={!!signingOut}
        onOpenChange={(open) => !open && setSigningOut(null)}
        title="Sign out everywhere?"
        description={
          signingOut &&
          `${userName(signingOut)} is signed out on every phone and computer. They need a new sign-in link to get back in.`
        }
        confirmLabel="Sign out everywhere"
        onConfirm={async () => {
          if (!signingOut) return;
          await api(`/auth/users/${signingOut.id}/sign-out`, { method: 'POST' });
          await qc.invalidateQueries({ queryKey: keys.users });
        }}
      />
    </div>
  );
}

function UserCard({
  user: u,
  isSelf,
  onLink,
  onSignOut,
}: {
  user: User;
  isSelf: boolean;
  onLink: (info: SignInLink) => void;
  onSignOut: () => void;
}) {
  const qc = useQueryClient();
  const admin = isAdmin(u);
  const link = useMutation({
    mutationFn: () => api<SignInLink>(`/auth/users/${u.id}/link`, { method: 'POST' }),
    onSuccess: onLink,
  });
  const role = useMutation({
    mutationFn: (next: 'admin' | 'user') =>
      api<User>(`/auth/users/${u.id}/role`, { method: 'PATCH', body: { role: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users }),
  });
  const error = link.error ?? role.error;
  // An admin can't remove their own admin role (the API refuses it too).
  const canChangeRole = !(isSelf && admin);

  return (
    <Card className={cn('p-4', !u.isActive && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{userName(u)}</span>
            {isSelf && <Badge>You</Badge>}
            {admin ? (
              <Badge className="bg-primary/15 text-primary">Admin</Badge>
            ) : (
              <Badge>User</Badge>
            )}
            {!u.isActive && (
              <Badge className="bg-destructive/15 text-destructive">Inactive</Badge>
            )}
          </div>
          {u.displayName && (
            <div className="truncate text-sm text-muted-foreground">{u.email}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {u.lastLoginAt
              ? `Last signed in ${formatDate(u.lastLoginAt)} · ${u.loginCount} ${u.loginCount === 1 ? 'sign-in' : 'sign-ins'}`
              : 'Never signed in'}
          </div>
        </div>
        <RowMenu label={userName(u)}>
          {u.isActive && (
            <DropdownMenuItem disabled={link.isPending} onSelect={() => link.mutate()}>
              <KeyRound /> Get sign-in link
            </DropdownMenuItem>
          )}
          {canChangeRole &&
            (admin ? (
              <DropdownMenuItem onSelect={() => role.mutate('user')}>
                <UserRoundCheck /> Make user
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => role.mutate('admin')}>
                <ShieldCheck /> Make admin
              </DropdownMenuItem>
            ))}
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut /> Sign out everywhere
          </DropdownMenuItem>
        </RowMenu>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-3">
          {errorMessage(error)}
        </Alert>
      )}
    </Card>
  );
}

function AddPersonDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const add = useMutation({
    mutationFn: () =>
      api<User>('/auth/users', {
        method: 'POST',
        body: {
          email: email.trim(),
          ...(name.trim() ? { displayName: name.trim() } : {}),
          role,
        },
      }),
    onSuccess: async () => {
      setName('');
      setEmail('');
      setRole('user');
      await qc.invalidateQueries({ queryKey: keys.users });
      onOpenChange(false);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) add.reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        title="Add a person"
        description="They can sign in once you send them a sign-in link (⋯ → Get sign-in link). No email is sent."
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id="add-name" label="Name">
            <Input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </Field>
          <Field id="add-email" label="Email">
            <Input
              id="add-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            id="add-role"
            label="Role"
            hint="Users add and change records. Admins can also delete, manage sign-in and see the activity log."
          >
            <Select
              id="add-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          {add.isError && (
            <Alert variant="destructive">
              {add.error instanceof ApiError && add.error.status === 409
                ? 'Someone with that email has already been added.'
                : errorMessage(add.error)}
            </Alert>
          )}
          <Button type="submit" size="lg" disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add person'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
