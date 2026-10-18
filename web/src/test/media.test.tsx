import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asUser, asViewer, mockApi, renderAt } from './render';

const media = [
  { id: 'm1', url: '/uploads/event/e1/a.jpg', kind: 'photo', caption: 'Exit', position: 0 },
  { id: 'm2', url: '/uploads/event/e1/b.mp4', kind: 'video', caption: null, position: 1 },
];
const event = { id: 'e1', name: 'Boogie', eventDate: '2099-03-10', media, coverUrl: media[0]!.url };
const eventApi = {
  'GET /api/events/e1': () => ({ status: 200, body: event }),
  'GET /api/events': () => ({ status: 200, body: [event] }),
};
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));

describe('MediaManager', () => {
  it('makes an item the cover', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      ...eventApi,
      'PATCH /api/media/m2': () => ({ status: 200, body: { ...media[1], position: 0 } }),
    });
    renderAt('/events/e1');
    // The first one is the cover, and has no Make cover.
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Exit' }));
    expect(screen.queryByRole('menuitem', { name: /Make cover/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for video 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Make cover/ }));
    await waitFor(() => expect(calls.find((c) => c.key === 'PATCH /api/media/m2')).toBeDefined());
    const patch = calls.find((c) => c.key === 'PATCH /api/media/m2')!;
    expect(bodyOf(patch.init)).toEqual({ makeCover: true });
    expect((patch.init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    // The event is fetched again to show the new order.
    await waitFor(() =>
      expect(calls.filter((c) => c.key === 'GET /api/events/e1').length).toBeGreaterThan(1),
    );
  });

  it('edits a caption', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      ...eventApi,
      'PATCH /api/media/m1': (init) => ({ status: 200, body: { ...media[0], ...bodyOf(init) } }),
    });
    renderAt('/events/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Exit' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Edit caption/ }));
    const d = within(await screen.findByRole('dialog', { name: 'Edit caption' }));
    const input = d.getByLabelText('Caption');
    expect(input).toHaveValue('Exit');
    await userEvent.clear(input);
    await userEvent.type(input, ' Under canopy ');
    await userEvent.click(d.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit caption' })).not.toBeInTheDocument(),
    );
    expect(bodyOf(calls.find((c) => c.key === 'PATCH /api/media/m1')!.init)).toEqual({
      caption: 'Under canopy',
    });
  });

  it('deletes an item after asking', async () => {
    let deleted = false;
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/events/e1': () => ({
        status: 200,
        body: deleted ? { ...event, media: [{ ...media[1], position: 0 }] } : event,
      }),
      'GET /api/events': () => ({ status: 200, body: [event] }),
      'DELETE /api/media/m1': () => {
        deleted = true;
        return { status: 200, body: { deleted: true } };
      },
    });
    renderAt('/events/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Exit' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    const d = within(await screen.findByRole('dialog', { name: 'Delete this photo?' }));
    expect(d.getByText(/removed from Boogie for everyone/)).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
    await userEvent.click(d.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Open (photo|video)/ })).toHaveLength(1),
    );
    expect(calls.filter((c) => c.key === 'DELETE /api/media/m1')).toHaveLength(1);
  });

  it('opens items full size with previous and next; viewers can only look', async () => {
    mockApi({ 'GET /api/auth/me': asViewer, ...eventApi });
    renderAt('/events/e1');
    await userEvent.click(await screen.findByRole('button', { name: 'Open Exit' }));
    let d = within(await screen.findByRole('dialog'));
    expect(d.getByRole('heading', { name: 'Photo 1 of 2 (cover)' })).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(d.queryByRole('button', { name: /Delete|Edit caption|Make cover/ })).toBeNull();
    await userEvent.click(d.getByRole('button', { name: 'Next' }));
    d = within(screen.getByRole('dialog'));
    expect(d.getByRole('heading', { name: 'Video 2 of 2' })).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.keyboard('{ArrowLeft}');
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Photo 1 of 2 (cover)' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: /Add photos or videos/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Take photo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
  });

  it('says which files did not upload, and keeps the others', async () => {
    let n = 0;
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...eventApi,
      'POST /api/media': () =>
        ++n === 1
          ? { status: 400, body: { message: 'Only JPEG, PNG … can be uploaded' } }
          : { status: 201, body: { ...media[1], id: 'm3', position: 2 } },
    });
    renderAt('/events/e1');
    await userEvent.upload(await screen.findByTestId('media-input'), [
      new File(['x'], 'notes.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    expect(
      await screen.findByText(/Some files didn't upload\. notes\.jpg: Only JPEG/),
    ).toBeInTheDocument();
    expect(n).toBe(2);
  });
});

describe('rig page photos', () => {
  const rig = {
    id: 'r1',
    number: '3',
    name: 'Blue',
    components: { container: null, main: null, reserve: null, aad: null },
    media: [{ id: 'm9', url: '/uploads/rig/r1/c.jpg', kind: 'photo', caption: null, position: 0 }],
    coverUrl: '/uploads/rig/r1/c.jpg',
  };

  it('shows the cover at the top and adds photos to the rig', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/rigs/r1': () => ({ status: 200, body: rig }),
      'GET /api/rigs': () => ({ status: 200, body: [rig] }),
      'GET /api/gear': () => ({ status: 200, body: [] }),
      'GET /api/people': () => ({ status: 200, body: [] }),
      'POST /api/media': () => ({
        status: 201,
        body: {
          id: 'm10',
          url: '/uploads/rig/r1/d.jpg',
          kind: 'photo',
          caption: null,
          position: 1,
        },
      }),
    });
    renderAt('/rigs/r1');
    const photos = await screen.findByRole('list', { name: 'Photos' });
    expect(within(photos).getAllByRole('button', { name: /Open photo/ })).toHaveLength(1);
    expect(screen.getAllByRole('img').some((i) => i.getAttribute('src') === rig.coverUrl)).toBe(
      true,
    );
    await userEvent.upload(screen.getByTestId('media-camera-input'), [
      new File(['d'], 'd.jpg', { type: 'image/jpeg' }),
    ]);
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /api/media')).toBe(true));
    const form = calls.find((c) => c.key === 'POST /api/media')!.init?.body as FormData;
    expect([form.get('ownerType'), form.get('ownerId')]).toEqual(['rig', 'r1']);
  });
});
