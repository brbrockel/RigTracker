import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Film,
  ImagePlus,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Field } from '@/components/Field';
import { RowMenu } from '@/components/RowMenu';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  api,
  canWrite,
  errorMessage,
  mediaUrl,
  uploadAll,
  type Media,
  type MediaOwnerType,
} from '@/lib/api';
import { invalidateMediaOwner } from '@/lib/queries';

const CAPTION_MAX = 200;
const noun = (m: Media) => (m.kind === 'video' ? 'video' : 'photo');

/** A photo or video at full size (videos play with controls). */
export function MediaView({
  item,
  alt,
  className,
}: {
  item: Media;
  alt: string;
  className?: string;
}) {
  const src = mediaUrl(item.url);
  return item.kind === 'video' ? (
    <video src={src} controls playsInline preload="metadata" className={className} />
  ) : (
    <img src={src} alt={item.caption || alt} className={className} />
  );
}

/**
 * The photos and videos of a rig, gear or event: a grid of thumbnails (the first is the
 * cover), adding from the camera or the library, and per item Make cover, Edit caption and
 * Delete. Opening one shows it full size with previous and next. Viewers only look.
 * `media` is the owner's list as its record returns it; changes refresh the owner's queries.
 */
export function MediaManager({
  ownerType,
  ownerId,
  ownerName,
  media,
  title = 'Photos and videos',
  bare = false,
}: {
  ownerType: MediaOwnerType;
  ownerId: string;
  /** For labels: "Delete this photo of <name>?" */
  ownerName: string;
  media: Media[];
  title?: string;
  /** Without the card, e.g. inside a dialog's form. */
  bare?: boolean;
}) {
  const qc = useQueryClient();
  const writer = canWrite(useUser());
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState('');
  // By id, so the open item stays open when the order changes (e.g. after Make cover).
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [captioning, setCaptioning] = useState<Media | null>(null);
  const [deleting, setDeleting] = useState<Media | null>(null);

  const items = [...media].sort((a, b) => a.position - b.position);
  const found = viewingId ? items.findIndex((m) => m.id === viewingId) : -1;
  const viewing = found >= 0 ? found : null;
  const setViewing = (i: number | null) => setViewingId(i === null ? null : (items[i]?.id ?? null));
  const refresh = () => invalidateMediaOwner(qc, ownerType);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      try {
        const { failed } = await uploadAll(ownerType, ownerId, files, setProgress);
        if (failed.length) throw new Error(`Some files didn't upload. ${failed.join('; ')}`);
      } finally {
        setProgress('Saving…');
        await refresh();
      }
    },
    onSettled: () => setProgress(''),
  });

  const change = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { caption?: string; makeCover?: true } }) =>
      api<Media>(`/media/${id}`, { method: 'PATCH', body }),
    onSuccess: () => refresh(),
  });

  function pick(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) upload.mutate(files);
  }
  function makeCover(m: Media) {
    change.mutate({ id: m.id, body: { makeCover: true } });
  }

  // Arrow keys step through while the viewer is open (wherever the focus is).
  useEffect(() => {
    if (viewing === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && viewing > 0) setViewingId(items[viewing - 1]!.id);
      if (e.key === 'ArrowRight' && viewing < items.length - 1)
        setViewingId(items[viewing + 1]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const busy = upload.isPending || change.isPending;
  const current = viewing === null ? undefined : items[viewing];
  const label = (m: Media, i: number) => m.caption || `${noun(m)} ${i + 1}`;

  const actions = writer && (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11"
        disabled={busy}
        onClick={() => camera.current?.click()}
      >
        <Camera /> Take photo
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-11"
        disabled={busy}
        onClick={() => library.current?.click()}
      >
        <ImagePlus /> Add photos or videos
      </Button>
      <input
        ref={library}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        data-testid="media-input"
        onChange={(e) => pick(e.currentTarget)}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="media-camera-input"
        onChange={(e) => pick(e.currentTarget)}
      />
    </div>
  );

  const body = (
    <div className="flex flex-col gap-3">
      {progress && (
        <p className="text-sm text-muted-foreground" role="status">
          {progress}
        </p>
      )}
      {upload.isError && <Alert variant="destructive">{errorMessage(upload.error)}</Alert>}
      {change.isError && <Alert variant="destructive">{errorMessage(change.error)}</Alert>}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos or videos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={title}>
          {items.map((m, i) => (
            <li key={m.id} className="relative flex flex-col gap-1">
              <button
                type="button"
                className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted"
                aria-label={`Open ${label(m, i)}`}
                onClick={() => setViewing(i)}
              >
                {m.kind === 'video' ? (
                  <>
                    <video
                      src={mediaUrl(m.url)}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                    />
                    <Film
                      className="absolute bottom-1.5 right-1.5 size-5 text-white drop-shadow"
                      aria-hidden
                    />
                  </>
                ) : (
                  <img
                    src={mediaUrl(m.url)}
                    alt={m.caption ?? ''}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </button>
              {i === 0 && (
                <Badge className="absolute left-1.5 top-1.5 gap-1 bg-background/90 text-foreground">
                  <Star className="size-3" aria-hidden /> Cover
                </Badge>
              )}
              {m.caption && (
                <p className="truncate text-xs text-muted-foreground" title={m.caption}>
                  {m.caption}
                </p>
              )}
              {writer && (
                <div className="absolute right-1 top-1 rounded-lg bg-background/80">
                  <RowMenu label={label(m, i)}>
                    {i > 0 && (
                      <DropdownMenuItem disabled={busy} onSelect={() => makeCover(m)}>
                        <Star /> Make cover
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem disabled={busy} onSelect={() => setCaptioning(m)}>
                      <Pencil /> Edit caption
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={busy}
                      onSelect={() => setDeleting(m)}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </RowMenu>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const dialogs: ReactNode = (
    <>
      <Dialog open={current !== undefined} onOpenChange={(o) => !o && setViewing(null)}>
        {current && viewing !== null && (
          <DialogContent
            title={`${current.kind === 'video' ? 'Video' : 'Photo'} ${viewing + 1} of ${items.length}${viewing === 0 ? ' (cover)' : ''}`}
            description={current.caption || undefined}
            className="sm:max-w-3xl"
          >
            <div className="flex flex-col gap-3">
              <MediaView
                key={current.id}
                item={current}
                alt={`${ownerName} ${viewing + 1}`}
                className="max-h-[65dvh] w-full rounded-lg bg-black object-contain"
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="Previous"
                  disabled={viewing === 0}
                  onClick={() => setViewing(viewing - 1)}
                >
                  <ChevronLeft />
                </Button>
                {writer && (
                  <div className="flex flex-wrap justify-center gap-1">
                    {viewing > 0 && (
                      <Button variant="ghost" disabled={busy} onClick={() => makeCover(current)}>
                        <Star /> Make cover
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label="Edit caption"
                      disabled={busy}
                      onClick={() => setCaptioning(current)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive"
                      aria-label={`Delete ${noun(current)}`}
                      disabled={busy}
                      onClick={() => setDeleting(current)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="Next"
                  disabled={viewing === items.length - 1}
                  onClick={() => setViewing(viewing + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {captioning && (
        <CaptionDialog
          item={captioning}
          onClose={() => setCaptioning(null)}
          onSave={(caption) =>
            change.mutateAsync({ id: captioning.id, body: { caption } }).then(() => undefined)
          }
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete this ${deleting ? noun(deleting) : 'photo'}?`}
        description={`It's removed from ${ownerName} for everyone. This can't be undone.`}
        onConfirm={async () => {
          await api(`/media/${deleting!.id}`, { method: 'DELETE' });
          setViewing(null);
          await refresh();
        }}
      />
    </>
  );

  if (bare)
    return (
      <section className="flex flex-col gap-3" aria-label={title}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{title}</span>
          {actions}
        </div>
        {body}
        {dialogs}
      </section>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>{body}</CardContent>
      {dialogs}
    </Card>
  );
}

function CaptionDialog({
  item,
  onClose,
  onSave,
}: {
  item: Media;
  onClose: () => void;
  onSave: (caption: string) => Promise<void>;
}) {
  const [caption, setCaption] = useState(item.caption ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    // Inside another form (the gear dialog), this one must not submit that one.
    e.stopPropagation();
    setSaving(true);
    setError('');
    try {
      await onSave(caption.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit caption">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field id="media-caption" label="Caption" hint={`${caption.length}/${CAPTION_MAX}`}>
            <Input
              id="media-caption"
              value={caption}
              maxLength={CAPTION_MAX}
              autoFocus
              onChange={(e) => setCaption(e.target.value)}
            />
          </Field>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
