import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asViewer, mockApi, renderAt } from './render';

const events = [
  { _id: 'e1', name: 'Spring Boogie', eventDate: '2099-03-10T00:00:00.000Z', photoUrls: ['/uploads/a.jpg', '/uploads/b.mp4'], eventPhotoUrl: '/uploads/a.jpg' },
  { _id: 'e2', name: 'Summer Trip', eventDate: '2099-06-01T00:00:00.000Z' },
  { _id: 'e3', name: 'Old Jump Day', eventDate: '2020-05-02T00:00:00.000Z' },
];

describe('events', () => {
  it('groups upcoming events by month, with past ones folded away', async () => {
    mockApi({
      'GET /api/auth/me': asViewer,
      'GET /api/events': () => ({ status: 200, body: events }),
    });
    renderAt('/events');
    expect(await screen.findByRole('heading', { name: 'March 2099' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'June 2099' })).toBeInTheDocument();
    const upcoming = screen.getByRole('region', { name: 'Upcoming' });
    expect(within(upcoming).getByRole('link', { name: /Spring Boogie/ })).toHaveAttribute('href', '/events/e1');
    expect(within(upcoming).getByText(/2 items/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New event/ })).not.toBeInTheDocument();

    expect(screen.queryByText('Old Jump Day')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Past \(1\)/ }));
    expect(screen.getByRole('heading', { name: 'May 2020' })).toBeInTheDocument();
    expect(screen.getByText('Old Jump Day')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'Search events' }), 'summer');
    expect(screen.queryByText('Spring Boogie')).not.toBeInTheDocument();
    expect(screen.getByText('Summer Trip')).toBeInTheDocument();
  });

  it('creates an event and opens it', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/events': () => ({ status: 200, body: [] }),
      'POST /api/events': () => ({ status: 201, body: { _id: 'e9', name: 'New one' } }),
      'GET /api/events/e9': () => ({ status: 200, body: { _id: 'e9', name: 'New one', eventDate: '2099-01-02T00:00:00.000Z' } }),
    });
    const router = renderAt('/events');
    await userEvent.click(await screen.findByRole('button', { name: /New event/ }));
    const d = within(await screen.findByRole('dialog'));
    await userEvent.type(d.getByLabelText('Name'), 'New one');
    await userEvent.clear(d.getByLabelText('Date'));
    await userEvent.type(d.getByLabelText('Date'), '2099-01-02');
    await userEvent.click(d.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/e9'));
    const post = calls.find((c) => c.key === 'POST /api/events')!;
    expect(JSON.parse(String(post.init?.body))).toMatchObject({ name: 'New one', eventDate: '2099-01-02' });
  });

  it.each([
    [false, 'false'],
    [true, 'true'],
  ])('deletes an event (also media: %s)', async (tick, expected) => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/events/e1': () => ({ status: 200, body: events[0] }),
      [`DELETE /api/events/e1?purgeMedia=${expected}`]: () => ({ status: 200, body: { deleted: true } }),
      'GET /api/events': () => ({ status: 200, body: [] }),
    });
    const router = renderAt('/events/e1');
    expect(await screen.findByRole('heading', { name: 'Spring Boogie' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Open (photo|video)/ })).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Spring Boogie' }));
    const d = within(await screen.findByRole('dialog'));
    if (tick) await userEvent.click(d.getByRole('checkbox', { name: 'Also delete its photos and videos' }));
    await userEvent.click(d.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/events'));
    const del = calls.find((c) => c.key.startsWith('DELETE'))!;
    expect(del.key).toBe(`DELETE /api/events/e1?purgeMedia=${expected}`);
    expect((del.init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
  });

  it('adds several photos one at a time, then saves them together', async () => {
    let n = 0;
    let saved: Record<string, unknown> = events[1]!;
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/events/e2': () => ({ status: 200, body: saved }),
      'POST /api/uploads/image?folder=events%2FSummer%20Trip': () => ({ status: 201, body: { url: `/uploads/x${++n}.jpg` } }),
      'PUT /api/events/e2': (init) => {
        saved = { ...saved, ...JSON.parse(String(init?.body)) };
        return { status: 200, body: saved };
      },
      'GET /api/events': () => ({ status: 200, body: events }),
    });
    renderAt('/events/e2');
    expect(await screen.findByText('No photos or videos yet.')).toBeInTheDocument();
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.mp4', { type: 'video/mp4' })];
    await userEvent.upload(screen.getByTestId('event-media-input'), files);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Open photo/ })).toHaveLength(2));
    const puts = calls.filter((c) => c.key === 'PUT /api/events/e2');
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String(puts[0]!.init?.body))).toEqual({
      photoUrls: ['/uploads/x1.jpg', '/uploads/x2.jpg'],
      eventPhotoUrl: '/uploads/x1.jpg',
    });
  });

  it('says when an event is missing', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/events/nope': () => ({ status: 404, body: { message: 'Event not found' } }),
    });
    renderAt('/events/nope');
    expect(await screen.findByText('Event not found')).toBeInTheDocument();
  });
});
