import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Film,
  ImagePlus,
  Pencil,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EventDialog } from '@/components/events/EventDialog';
import { PageHeader } from '@/components/PageHeader';
import { RowMenu } from '@/components/RowMenu';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  api,
  ApiError,
  canDelete,
  canWrite,
  errorMessage,
  formatDate,
  isVideo,
  mediaUrl,
  uploadMedia,
  type RigEvent,
} from '@/lib/api';
import { keys, useEvent } from '@/lib/queries';

/** The gallery: every photo/video, with the main one included. */
const galleryOf = (e: RigEvent) => {
  const urls = [...(e.photoUrls ?? [])];
  if (e.eventPhotoUrl && !urls.includes(e.eventPhotoUrl)) urls.unshift(e.eventPhotoUrl);
  return urls;
};

function Media({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const src = mediaUrl(url);
  return isVideo(url) ? (
    <video src={src} controls playsInline preload="metadata" className={className} />
  ) : (
    <img src={src} alt={alt} className={className} />
  );
}

export function EventPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useUser();
  const qc = useQueryClient();
  const event = useEvent(id);
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [purgeMedia, setPurgeMedia] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [progress, setProgress] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: keys.events });
  /** The latest copy of the event, so a change never works from a stale list. */
  const latest = () => qc.getQueryData<RigEvent>(keys.event(id)) ?? event.data!;

  const update = useMutation({
    mutationFn: (body: Partial<RigEvent>) =>
      api<RigEvent>(`/events/${id}`, { method: 'PUT', body }),
    onSuccess: (saved) => {
      qc.setQueryData(keys.event(id), saved);
      return refresh();
    },
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const folder = `events/${latest().name?.trim() || 'uncategorized'}`;
      const uploaded: string[] = [];
      const failed: string[] = [];
      for (const [i, f] of files.entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`);
        try {
          uploaded.push(await uploadMedia(f, folder));
        } catch (err) {
          failed.push(`${f.name}: ${errorMessage(err, 'upload failed')}`);
        }
      }
      if (uploaded.length) {
        setProgress('Saving…');
        // Merge with the event as it is now (not as it was when the files were picked).
        const current = latest();
        const photoUrls = [...galleryOf(current)];
        for (const u of uploaded) if (!photoUrls.includes(u)) photoUrls.push(u);
        await update.mutateAsync({
          photoUrls,
          eventPhotoUrl: current.eventPhotoUrl || photoUrls[0],
        });
      }
      if (failed.length) throw new Error(`Some files didn't upload. ${failed.join('; ')}`);
    },
    onSettled: () => setProgress(''),
  });

  const remove = useMutation({
    mutationFn: () =>
      api(`/events/${id}?purgeMedia=${purgeMedia ? 'true' : 'false'}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      navigate('/events', { replace: true });
    },
  });

  function makeMain(url: string) {
    update.mutate({ eventPhotoUrl: url, photoUrls: galleryOf(latest()) });
  }
  function removeItem(url: string) {
    const current = latest();
    const photoUrls = galleryOf(current).filter((u) => u !== url);
    const main = current.eventPhotoUrl === url ? (photoUrls[0] ?? '') : current.eventPhotoUrl;
    setViewing(null);
    update.mutate({ photoUrls, eventPhotoUrl: main ?? '' });
  }
  function pick(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) upload.mutate(files);
  }

  const back = (
    <Link
      to="/events"
      className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Events
    </Link>
  );

  if (event.isError) {
    const missing = event.error instanceof ApiError && event.error.status === 404;
    return (
      <div className="flex flex-col gap-5">
        {back}
        {missing ? (
          <>
            <PageHeader title="Event not found" />
            <p className="text-sm text-muted-foreground">It may have been deleted.</p>
          </>
        ) : (
          <Alert variant="destructive">{errorMessage(event.error)}</Alert>
        )}
      </div>
    );
  }
  if (!event.data)
    return (
      <div className="flex flex-col gap-5">
        {back}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );

  const e = event.data;
  const name = e.name || 'Untitled event';
  const gallery = galleryOf(e);
  const main = e.eventPhotoUrl || gallery[0];
  const writer = canWrite(user);
  const busy = upload.isPending || update.isPending;
  const current = viewing === null ? undefined : gallery[viewing];

  return (
    <div className="flex flex-col gap-5">
      {back}
      <PageHeader
        title={name}
        subtitle={formatDate(e.eventDate) || 'No date'}
        action={
          (writer || canDelete(user)) && (
            <>
              {writer && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
              )}
              {canDelete(user) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 text-destructive"
                  aria-label={`Delete ${name}`}
                  onClick={() => {
                    setPurgeMedia(false);
                    setDeleting(true);
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </>
          )
        }
      />

      {main && (
        <Media
          url={main}
          alt={`${name} main photo`}
          className="max-h-[60dvh] w-full rounded-xl bg-black object-contain"
        />
      )}
      {e.description && <p className="whitespace-pre-line text-sm">{e.description}</p>}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <CardTitle>Photos and videos</CardTitle>
          {writer && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-11"
                disabled={busy}
                onClick={() => camera.current?.click()}
              >
                <Camera /> Take photo
              </Button>
              <Button
                size="sm"
                className="h-11"
                disabled={busy}
                onClick={() => library.current?.click()}
              >
                <ImagePlus /> Add photos or videos
              </Button>
            </div>
          )}
          <input
            ref={library}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            data-testid="event-media-input"
            onChange={(ev) => pick(ev.currentTarget)}
          />
          <input
            ref={camera}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            hidden
            onChange={(ev) => pick(ev.currentTarget)}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {progress && (
            <p className="text-sm text-muted-foreground" role="status">
              {progress}
            </p>
          )}
          {upload.isError && <Alert variant="destructive">{errorMessage(upload.error)}</Alert>}
          {update.isError && !upload.isError && (
            <Alert variant="destructive">{errorMessage(update.error)}</Alert>
          )}
          {gallery.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos or videos yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gallery.map((url, i) => (
                <li key={url} className="relative">
                  <button
                    type="button"
                    className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted"
                    aria-label={`Open ${isVideo(url) ? 'video' : 'photo'} ${i + 1}`}
                    onClick={() => setViewing(i)}
                  >
                    {isVideo(url) ? (
                      <>
                        <video
                          src={mediaUrl(url)}
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
                        src={mediaUrl(url)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )}
                  </button>
                  {url === main && (
                    <Badge className="absolute left-1.5 top-1.5 gap-1 bg-background/90 text-foreground">
                      <Star className="size-3" aria-hidden /> Main
                    </Badge>
                  )}
                  {writer && (
                    <div className="absolute right-1 top-1 rounded-lg bg-background/80">
                      <RowMenu label={`${isVideo(url) ? 'video' : 'photo'} ${i + 1}`}>
                        {url !== main && (
                          <DropdownMenuItem disabled={busy} onSelect={() => makeMain(url)}>
                            <Star /> Make main
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          disabled={busy}
                          onSelect={() => removeItem(url)}
                        >
                          <X /> Remove from event
                        </DropdownMenuItem>
                      </RowMenu>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={current !== undefined} onOpenChange={(o) => !o && setViewing(null)}>
        {current && viewing !== null && (
          <DialogContent
            title={`${isVideo(current) ? 'Video' : 'Photo'} ${viewing + 1} of ${gallery.length}`}
            className="sm:max-w-3xl"
          >
            <div className="flex flex-col gap-3">
              <Media
                url={current}
                alt={`${name} ${viewing + 1}`}
                className="max-h-[70dvh] w-full rounded-lg bg-black object-contain"
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
                <div className="flex flex-wrap justify-center gap-2">
                  {writer && current !== main && (
                    <Button variant="outline" disabled={busy} onClick={() => makeMain(current)}>
                      <Star /> Make main
                    </Button>
                  )}
                  {writer && (
                    <Button
                      variant="outline"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => removeItem(current)}
                    >
                      <X /> Remove
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="Next"
                  disabled={viewing === gallery.length - 1}
                  onClick={() => setViewing(viewing + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {editing && <EventDialog event={e} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${name}?`}
        description="The event is removed for everyone. This can't be undone."
        onConfirm={() => remove.mutateAsync()}
      >
        <label className="mb-4 flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-destructive"
            checked={purgeMedia}
            onChange={(ev) => setPurgeMedia(ev.target.checked)}
          />
          Also delete its photos and videos
        </label>
      </ConfirmDialog>
    </div>
  );
}
