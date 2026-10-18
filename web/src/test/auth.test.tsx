import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, mockApi, renderAt, signedOut } from './render';

describe('sign-in', () => {
  it('sends signed-out visitors to the sign-in page, which explains links', async () => {
    mockApi({ 'GET /api/auth/me': signedOut });
    const router = renderAt('/rigs');
    expect(
      await screen.findByText(/Ask a RigTracker admin for a sign-in link/),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('checks a link, then uses it only when Sign in is pressed', async () => {
    window.location.hash = '#token=' + 'a'.repeat(43);
    let signedIn = false;
    const calls = mockApi({
      'GET /api/auth/me': () => (signedIn ? asAdmin() : signedOut()),
      'POST /api/auth/link/check': () => ({
        status: 201,
        body: { email: 'brian@example.com', displayName: 'Brian B' },
      }),
      'POST /api/auth/link/redeem': () => {
        signedIn = true;
        return { status: 201, body: asAdmin().body };
      },
      'GET /api/rigs': () => ({ status: 200, body: [] }),
      'GET /api/events': () => ({ status: 200, body: [] }),
      'GET /api/gear': () => ({ status: 200, body: [] }),
      'GET /api/people': () => ({ status: 200, body: [] }),
    });
    const router = renderAt('/sign-in');
    expect(await screen.findByText('Brian B (brian@example.com)')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/auth/link/redeem')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    window.location.hash = '';
  });

  it('says when a link was already used', async () => {
    window.location.hash = '#token=' + 'b'.repeat(43);
    mockApi({
      'GET /api/auth/me': signedOut,
      'POST /api/auth/link/check': () => ({
        status: 404,
        body: {
          message: 'This sign-in link has expired or was already used. Ask an admin for a new one.',
        },
      }),
    });
    renderAt('/sign-in');
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    window.location.hash = '';
  });
});
