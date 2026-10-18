import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useUser } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EventDialog } from '@/components/events/EventDialog';
import { MediaManager, MediaView } from '@/components/media/MediaManager';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, ApiError, canDelete, canWrite, errorMessage, formatDate } from '@/lib/api';
import { keys, useEvent } from '@/lib/queries';

export function EventPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useUser();
  const qc = useQueryClient();
  const event = useEvent(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Its photos and videos are deleted with it.
  const remove = useMutation({
    mutationFn: () => api(`/events/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.events });
      navigate('/events', { replace: true });
    },
  });

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
  const media = [...(e.media ?? [])].sort((a, b) => a.position - b.position);
  const cover = media[0];
  const writer = canWrite(user);
  const count = media.length;

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
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 />
                </Button>
              )}
            </>
          )
        }
      />

      {cover && (
        <figure className="flex flex-col gap-1">
          <MediaView
            key={cover.id}
            item={cover}
            alt={`${name} main photo`}
            className="max-h-[60dvh] w-full rounded-xl bg-black object-contain"
          />
          {cover.caption && (
            <figcaption className="text-sm text-muted-foreground">{cover.caption}</figcaption>
          )}
        </figure>
      )}
      {e.description && <p className="whitespace-pre-line text-sm">{e.description}</p>}

      <MediaManager ownerType="event" ownerId={e.id} ownerName={name} media={media} />

      {editing && <EventDialog event={e} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${name}?`}
        description={
          count
            ? `The event and its ${count === 1 ? 'photo or video' : `${count} photos and videos`} are deleted for everyone. This can't be undone.`
            : "The event is deleted for everyone. This can't be undone."
        }
        onConfirm={() => remove.mutateAsync()}
      />
    </div>
  );
}
