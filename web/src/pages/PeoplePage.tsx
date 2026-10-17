import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { RowMenu } from '@/components/RowMenu';
import { ContactLinks, fullName } from '@/components/people/ContactLinks';
import { PersonDialog } from '@/components/people/PersonDialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input, Select } from '@/components/ui/input';
import { api, canDelete, canWrite, errorMessage, type Person } from '@/lib/api';
import { keys, usePeople } from '@/lib/queries';

type Sort = 'first' | 'last';

export function PeoplePage() {
  const user = useUser();
  const people = usePeople();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('first');
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);

  const remove = useMutation({
    mutationFn: (p: Person) => api(`/people/${p._id}`, { method: 'DELETE' }),
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
      .sort((a, b) => key(a).localeCompare(key(b)));
  }, [people.data, search, sort]);

  const writer = canWrite(user);
  const admin = canDelete(user);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="People"
        subtitle="Jumpers, riggers and anyone with gear."
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
      </div>

      {people.isError && <Alert variant="destructive">{errorMessage(people.error)}</Alert>}
      {people.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}

      <ul className="flex flex-col gap-3">
        {shown.map((p) => (
          <li key={p._id}>
            <Card className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/people/${p._id}`}
                  className="block truncate py-1 font-medium hover:text-primary hover:underline"
                >
                  {fullName(p)}
                </Link>
                <ContactLinks email={p.email} phone={p.phone} />
                {!p.email && !p.phone && (
                  <p className="text-sm text-muted-foreground">No contact details</p>
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
                    <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(p)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  )}
                </RowMenu>
              )}
            </Card>
          </li>
        ))}
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
