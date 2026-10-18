import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { NoticeDialog } from '@/components/NoticesPanel';
import { PageHeader } from '@/components/PageHeader';
import { RowMenu } from '@/components/RowMenu';
import { ContactLinks, fullName } from '@/components/people/ContactLinks';
import { PersonDialog } from '@/components/people/PersonDialog';
import { AccessBadges, lastSignInText, useSignInActions } from '@/components/people/SignInAccess';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { api, canDelete, canSignIn, canWrite, errorMessage, type Person } from '@/lib/api';
import { keys, usePeople } from '@/lib/queries';

type Sort = 'first' | 'last';
type Filter = '' | 'sign-in' | 'admin' | 'none';

const matchesFilter = (p: Person, f: Filter) =>
  f === '' ||
  (f === 'sign-in' && canSignIn(p)) ||
  (f === 'admin' && canSignIn(p) && !!p.roles?.includes('admin')) ||
  (f === 'none' && !canSignIn(p));

export function PeoplePage() {
  const user = useUser();
  const people = usePeople();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('first');
  const [filter, setFilter] = useState<Filter>('');
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [noticeFor, setNoticeFor] = useState<Person | null>(null);
  const signIn = useSignInActions();

  const remove = useMutation({
    mutationFn: (p: Person) => api(`/people/${p.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.people }),
  });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const key = (p: Person) =>
      (sort === 'last' ? [p.lastName, p.firstName] : [p.firstName, p.lastName])
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return (people.data ?? [])
      .filter(
        (p) =>
          !q ||
          fullName(p).toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q) ||
          (digits.length >= 3 && p.phone?.replace(/\D/g, '').includes(digits)),
      )
      .filter((p) => matchesFilter(p, filter))
      .sort((a, b) => key(a).localeCompare(key(b)));
  }, [people.data, search, sort, filter]);

  const writer = canWrite(user);
  const admin = canDelete(user);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="People"
        subtitle={
          <>
            Jumpers, riggers and anyone with gear.
            {admin && (
              <>
                <br />
                Anyone here can be given sign-in access. Each password link works once and lasts 72
                hours, and lets them set a password.
              </>
            )}
          </>
        }
        action={
          writer && (
            <Button onClick={() => setEditing('new')}>
              <UserPlus /> New person
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Search people"
          placeholder="Search by name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Sort by"
          className="sm:w-48"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="first">First name</option>
          <option value="last">Last name</option>
        </Select>
        <Select
          aria-label="Filter people"
          className="sm:w-48"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="">Everyone</option>
          <option value="sign-in">Can sign in</option>
          <option value="admin">Admins</option>
          <option value="none">No sign-in</option>
        </Select>
      </div>

      {people.isError && <Alert variant="destructive">{errorMessage(people.error)}</Alert>}
      {signIn.error && <Alert variant="destructive">{signIn.error}</Alert>}
      {people.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}

      <ul className="flex flex-col gap-3">
        {shown.map((p) => {
          const isSelf = p.id === user?.id;
          return (
            <li key={p.id}>
              <Card className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/people/${p.id}`}
                      className="block truncate py-1 font-medium hover:text-primary hover:underline"
                    >
                      {fullName(p)}
                    </Link>
                    <AccessBadges person={p} isSelf={isSelf} />
                  </div>
                  <ContactLinks email={p.email} phone={p.phone} />
                  {!p.email && !p.phone && (
                    <p className="text-sm text-muted-foreground">No contact details</p>
                  )}
                  {admin && !!p.roles?.length && (
                    <p className="mt-1 text-xs text-muted-foreground">{lastSignInText(p)}</p>
                  )}
                </div>
                {(writer || admin) && (
                  <RowMenu label={fullName(p)}>
                    {writer && (
                      <DropdownMenuItem onSelect={() => setEditing(p)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                    )}
                    {admin && (
                      <DropdownMenuItem onSelect={() => setNoticeFor(p)}>
                        <Megaphone /> Send notice
                      </DropdownMenuItem>
                    )}
                    {admin && (
                      <>
                        <DropdownMenuSeparator />
                        {signIn.menuItems(p)}
                      </>
                    )}
                    {admin && !isSelf && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => setDeleting(p)}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </RowMenu>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      {people.data && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {people.data.length === 0 ? 'No people yet.' : 'No one matches.'}
        </p>
      )}

      {editing && (
        <PersonDialog
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {signIn.dialogs}
      {noticeFor && (
        <NoticeDialog
          preset={{ recipientId: noticeFor.id, label: fullName(noticeFor) }}
          onClose={() => setNoticeFor(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting ? fullName(deleting) : ''}?`}
        description="This can't be undone."
        onConfirm={() => remove.mutateAsync(deleting!)}
      />
    </div>
  );
}
