import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCheck,
  Megaphone,
  MessageSquare,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { noticesKey, useMarkNotices, useNotices } from '@/components/NoticeBanners';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import {
  api,
  errorMessage,
  noticeHeadline,
  personName,
  type Notice,
  type NoticeAudience,
  type NoticePhones,
} from '@/lib/api';
import { usePeople } from '@/lib/queries';
import { smsHref } from '@/lib/sms';
import { formatDay, localDay, timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * The horn in the top bar: how many notices are new that aren't already showing as a banner,
 * and a panel with every notice for you (guests: the public ones). Admins post, edit, delete
 * and text them from here.
 */
export function NoticesButton({
  admin,
  guest,
  open,
  onOpenChange,
}: {
  admin: boolean;
  guest: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const list = useNotices();
  const mark = useMarkNotices();
  const [posting, setPosting] = useState(false);
  const items = list.data ?? [];
  const count = guest ? 0 : items.filter((n) => !n.read && !n.banner).length;
  const unread = guest ? [] : items.filter((n) => !n.read).map((n) => n.id);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={count ? `Notices (${count} new)` : 'Notices'}
        onClick={() => onOpenChange(true)}
      >
        <Megaphone />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) setPosting(false);
        }}
      >
        <DialogContent title="Notices">
          <div className="flex flex-col gap-3">
            {(admin || unread.length > 0) && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {unread.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mark.isPending}
                    onClick={() => mark.mutate({ how: 'read', ids: unread })}
                  >
                    <CheckCheck /> Mark all read
                  </Button>
                )}
                {admin && !posting && (
                  <Button size="sm" variant="outline" onClick={() => setPosting(true)}>
                    <Plus /> New notice
                  </Button>
                )}
              </div>
            )}
            {posting && <NoticeForm onDone={() => setPosting(false)} />}
            {list.isError && <Alert variant="destructive">{errorMessage(list.error)}</Alert>}
            {list.isSuccess && items.length === 0 && !posting && (
              <p className="text-sm text-muted-foreground">No notices yet.</p>
            )}
            {items.length > 0 && (
              <ul className="divide-y">
                {items.map((n) => (
                  <NoticeItem key={n.id} n={n} canEdit={admin} guest={guest} />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** For admins: how long it shows as a banner ("banner until Fri, Oct 24"), if it still does. */
function bannerNote(n: Notice) {
  if (n.bannerUntil === null) return n.pinned ? 'banner until each person dismisses it' : null;
  const ends = new Date(n.bannerUntil);
  if (ends < new Date()) return null;
  return `banner until ${formatDay(localDay(ends))}`;
}

const smsText = (n: { title?: string | null; body: string }) =>
  n.title ? `${n.title}\n\n${n.body}` : n.body;

/** "Also text it (3)": opens your Messages with the text and the numbers; says who's skipped. */
function TextLink({
  result,
  notice,
  label,
}: {
  result: NoticePhones;
  notice: { title?: string | null; body: string };
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {result.phones.length > 0 ? (
        <Button asChild size="sm" variant="secondary" className="self-start">
          <a href={smsHref(result.phones, smsText(notice))}>
            <MessageSquare /> {label} ({result.phones.length})
          </a>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Nobody it's for has a mobile number.</p>
      )}
      {result.phones.length > 0 && result.skipped > 0 && (
        <p className="text-xs text-muted-foreground">
          {result.skipped} {result.skipped === 1 ? 'person has' : 'people have'} no mobile number
          and {result.skipped === 1 ? 'is' : 'are'} skipped.
        </p>
      )}
    </div>
  );
}

function NoticeItem({ n, canEdit, guest }: { n: Notice; canEdit: boolean; guest: boolean }) {
  const qc = useQueryClient();
  const mark = useMarkNotices();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const phones = useMutation({
    mutationFn: () => api<NoticePhones>(`/notices/${n.id}/phones`),
  });
  const headline = noticeHeadline(n);

  if (editing)
    return (
      <li className="py-3">
        <NoticeForm existing={n} onDone={() => setEditing(false)} />
      </li>
    );
  return (
    <li className="flex gap-2 py-3 first:pt-0">
      <div
        className="min-w-0 flex-1"
        onClick={() => !n.read && !guest && mark.mutate({ how: 'read', ids: [n.id] })}
      >
        <div
          className={cn(
            'flex items-center gap-1.5',
            !n.read && !guest ? 'font-semibold' : 'font-medium',
          )}
        >
          {n.pinned && <Pin className="size-3.5 shrink-0 text-primary" aria-label="Must see" />}
          {!n.read && !guest && (
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="New" />
          )}
          <span className="min-w-0 break-words">{headline}</span>
        </div>
        {n.title && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {n.body}
          </p>
        )}
        {!n.title && n.body.includes('\n') && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {n.body.split('\n').slice(1).join('\n').trim()}
          </p>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          {[n.to, n.author, timeAgo(n.createdAt), n.updatedAt && 'edited', canEdit && bannerNote(n)]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {phones.data && (
          <div className="mt-2">
            <TextLink result={phones.data} notice={n} label="Send the text" />
          </div>
        )}
        {phones.isError && (
          <Alert variant="destructive" className="mt-2">
            {errorMessage(phones.error)}
          </Alert>
        )}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Text ${headline}`}
            title="Text it from your phone"
            disabled={phones.isPending}
            onClick={() => phones.mutate()}
          >
            <MessageSquare />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Edit ${headline}`}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Delete ${headline}`}
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
          </Button>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Delete this notice?"
            description={`"${headline}" is removed for everyone. This can't be undone.`}
            onConfirm={async () => {
              await api(`/notices/${n.id}`, { method: 'DELETE' });
              await qc.invalidateQueries({ queryKey: noticesKey });
            }}
          />
        </div>
      )}
    </li>
  );
}

/** Who a notice from a shortcut is for (a person's ⋯ menu on People). */
export interface NoticePreset {
  recipientId: string;
  /** Their name, for "For Ada Lovelace". */
  label: string;
}

/** A new notice from a shortcut, already pointed at one person. */
export function NoticeDialog({ preset, onClose }: { preset: NoticePreset; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="New notice" description={`For ${preset.label}`}>
        <NoticeForm preset={preset} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** A banner's last day as the date input wants it (the viewer's own day). */
const dayOf = (iso: string | null) => (iso ? localDay(new Date(iso)) : '');
/** The end of a chosen day, in the viewer's time zone. */
const endOfDay = (day: string) => (day ? new Date(`${day}T23:59:59.999`).toISOString() : null);

function NoticeForm({
  existing,
  preset,
  onDone,
}: {
  existing?: Notice;
  preset?: NoticePreset;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [audience, setAudience] = useState<NoticeAudience>(preset ? 'person' : 'everyone');
  const [recipientId, setRecipientId] = useState(preset?.recipientId ?? '');
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  // An existing notice shows the day its banner ends; it's only sent when changed.
  const startUntil = dayOf(existing?.bannerUntil ?? null);
  const [until, setUntil] = useState(startUntil);
  const [sent, setSent] = useState<NoticePhones | null>(null);
  const people = usePeople();
  const choices = (people.data ?? [])
    .map((p) => ({ id: p.id, label: personName(p) || p.email || 'Unnamed' }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const save = useMutation({
    mutationFn: (): Promise<unknown> =>
      existing
        ? api<Notice>(`/notices/${existing.id}`, {
            method: 'PATCH',
            body: {
              title: title.trim() || null,
              body,
              pinned,
              ...(until !== startUntil ? { bannerUntil: endOfDay(until) } : {}),
            },
          })
        : api<NoticePhones>('/notices', {
            method: 'POST',
            body: {
              ...(title.trim() ? { title } : {}),
              body,
              audience,
              ...(audience === 'person' ? { recipientId } : {}),
              pinned,
              ...(until ? { bannerUntil: endOfDay(until) } : {}),
            },
          }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: noticesKey });
      if (!existing) {
        const res = r as NoticePhones;
        if (res.phones.length || res.skipped) {
          setSent({ phones: res.phones, skipped: res.skipped });
          return;
        }
      }
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const id = existing?.id ?? 'new';
  const ready = body.trim() && (audience !== 'person' || recipientId);

  if (sent)
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Posted.</p>
        <TextLink
          result={sent}
          notice={{ title: title.trim() || null, body: body.trim() }}
          label="Also text it"
        />
        <Button size="sm" variant="ghost" className="self-start" onClick={onDone}>
          Done
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border p-3">
      {!existing && !preset && (
        <>
          <Label htmlFor="n-audience">For</Label>
          <Select
            id="n-audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as NoticeAudience)}
          >
            <option value="everyone">Everyone who signs in</option>
            <option value="person">One person</option>
            <option value="public">The public (guests too)</option>
          </Select>
          {audience === 'person' && (
            <Select
              aria-label="Person"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">Pick the person</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </>
      )}
      <Label htmlFor={`n-title-${id}`}>Title (optional)</Label>
      <Input
        id={`n-title-${id}`}
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Rigging day Saturday"
      />
      <Label htmlFor={`n-body-${id}`}>Notice</Label>
      <textarea
        id={`n-body-${id}`}
        rows={3}
        required
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-lg border bg-card px-3 py-2 text-base shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Must see (a banner until each person dismisses it)
      </label>
      <Label htmlFor={`n-until-${id}`}>Banner until</Label>
      <Input
        id={`n-until-${id}`}
        type="date"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Empty: {pinned ? 'until each person dismisses it' : 'a week (two days for one person)'}. It
        stays in the notices list after.
      </p>
      {save.isError && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || !ready}>
          <Check /> {existing ? 'Save' : 'Post'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
