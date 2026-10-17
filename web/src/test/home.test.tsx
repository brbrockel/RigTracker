import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { asUser, mockApi, renderAt } from './render';

/** Midnight UTC, the way the API stores dates. */
const day = (offset: number) =>
  `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;

describe('home', () => {
  it('shows overdue and soon-due repacks, upcoming events and totals', async () => {
    mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/rigs': () => ({
        status: 200,
        body: [
          { _id: 'r1', number: '7', name: 'Javelin', repackDue: day(-10), lastPacked: day(-190) },
          { _id: 'r2', name: 'Vector', repackDue: day(12) },
          { _id: 'r3', name: 'Mirage', repackDue: day(120) },
        ],
      }),
      'GET /api/events': () => ({
        status: 200,
        body: [
          { _id: 'e1', name: 'Boogie', eventDate: day(5) },
          { _id: 'e2', name: 'Last year', eventDate: day(-300) },
        ],
      }),
      'GET /api/gear': () => ({ status: 200, body: [{ _id: 'g1' }, { _id: 'g2' }] }),
      'GET /api/people': () => ({ status: 200, body: [{ _id: 'p1' }] }),
    });
    renderAt('/');

    expect(await screen.findByText('Hi, Brian')).toBeInTheDocument();
    const overdue = await screen.findByRole('link', { name: /#7 · Javelin/ });
    expect(overdue).toHaveAttribute('href', '/rigs/r1');
    expect(within(overdue).getByText(/Overdue 10 days/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Vector/ })).toHaveTextContent(/Due in 12 days/);
    expect(screen.queryByText('Mirage')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Boogie/ })).toHaveAttribute('href', '/events/e1');
    expect(screen.queryByText('Last year')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all events' })).toHaveAttribute('href', '/events');

    expect(screen.getByRole('link', { name: 'Gear: 2' })).toHaveAttribute('href', '/gear');
    expect(screen.getByRole('link', { name: /New rig/ })).toBeInTheDocument();
  });

  it('says when every rig is in date', async () => {
    mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/rigs': () => ({ status: 200, body: [{ _id: 'r1', repackDue: day(90) }] }),
      'GET /api/events': () => ({ status: 200, body: [] }),
      'GET /api/gear': () => ({ status: 200, body: [] }),
      'GET /api/people': () => ({ status: 200, body: [] }),
    });
    renderAt('/');
    expect(await screen.findByText(/All rigs are in date/)).toBeInTheDocument();
    expect(screen.getByText('No events coming up.')).toBeInTheDocument();
  });
});
