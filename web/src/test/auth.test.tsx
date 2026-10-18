import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { asAdmin, asGuest, mockApi, renderAt, signedOut } from './render';

const empty = () => ({ status: 200, body: [] });
const home = {
  'GET /api/rigs': empty,
  'GET /api/events': empty,
  'GET /api/gear': empty,
  'GET /api/people': empty,
};
const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body ?? '{}'));

afterEach(() => {
  window.location.hash = '';
});

describe('sign-in page', () => {
  it('sends signed-out visitors to the sign-in page, which asks for email and password', async () => {
    mockApi({ 'GET /api/auth/me': signedOut });
    const router = renderAt('/rigs');
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText(/Ask a RigTracker admin for a password link/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('signs in with email and password', async () => {
    let signedIn = false;
    const calls = mockApi({
      'GET /api/auth/me': () => (signedIn ? asAdmin() : signedOut()),
      'POST /api/auth/sign-in': () => {
        signedIn = true;
        return { status: 201, body: asAdmin().body };
      },
      ...home,
    });
    const user = userEvent.setup();
    const router = renderAt('/sign-in');
    await user.type(await screen.findByLabelText('Email'), 'brian@example.com');
    await user.type(screen.getByLabelText('Password'), 'plum tractor sideways');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    const call = calls.find((c) => c.key === 'POST /api/auth/sign-in')!;
    expect(body(call.init)).toEqual({
      email: 'brian@example.com',
      password: 'plum tractor sideways',
    });
  });

  it('shows the API’s message for a wrong password', async () => {
    mockApi({
      'GET /api/auth/me': signedOut,
      'POST /api/auth/sign-in': () => ({
        status: 401,
        body: { message: 'Email or password is incorrect' },
      }),
    });
    const user = userEvent.setup();
    renderAt('/sign-in');
    await user.type(await screen.findByLabelText('Email'), 'brian@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect')).toBeInTheDocument();
  });

  it('asks for an authenticator code when the account has one', async () => {
    let signedIn = false;
    const calls = mockApi({
      'GET /api/auth/me': () => (signedIn ? asAdmin() : signedOut()),
      'POST /api/auth/sign-in': () => ({
        status: 201,
        body: { needsCode: true, token: 'step-token' },
      }),
      'POST /api/auth/sign-in/code': (init) => {
        if (body(init).code !== '123456')
          return { status: 401, body: { message: 'That code is not right.' } };
        signedIn = true;
        return { status: 201, body: asAdmin().body };
      },
      ...home,
    });
    const user = userEvent.setup();
    const router = renderAt('/sign-in');
    await user.type(await screen.findByLabelText('Email'), 'brian@example.com');
    await user.type(screen.getByLabelText('Password'), 'plum tractor sideways');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const code = await screen.findByLabelText('Code');
    await user.type(code, '654321');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('That code is not right.')).toBeInTheDocument();
    await user.clear(code);
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const last = calls.filter((c) => c.key === 'POST /api/auth/sign-in/code').at(-1)!;
    expect(body(last.init)).toEqual({ token: 'step-token', code: '123456' });
  });

  it('looks around as a guest', async () => {
    let guest = false;
    mockApi({
      'GET /api/auth/me': () => (guest ? asGuest() : signedOut()),
      'POST /api/auth/guest': () => {
        guest = true;
        return { status: 201, body: asGuest().body };
      },
      'GET /api/rigs': empty,
      'GET /api/events': empty,
      'GET /api/gear': empty,
    });
    const user = userEvent.setup();
    const router = renderAt('/sign-in');
    await user.click(await screen.findByRole('button', { name: /Look around as a guest/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText(/looking around as a guest/)).toBeInTheDocument();
  });
});

describe('password links (/sign-in#token=…)', () => {
  const linkInfo = () => ({
    status: 201,
    body: { email: 'brian@example.com', displayName: 'Brian B', hasPassword: false },
  });

  it('shows who it is for and only uses it when the password is saved', async () => {
    window.location.hash = '#token=' + 'a'.repeat(43);
    let signedIn = false;
    const calls = mockApi({
      'GET /api/auth/me': () => (signedIn ? asAdmin() : signedOut()),
      'POST /api/auth/link/check': linkInfo,
      'POST /api/auth/link/redeem': () => {
        signedIn = true;
        return { status: 201, body: asAdmin().body };
      },
      ...home,
    });
    const user = userEvent.setup();
    const router = renderAt('/sign-in');
    expect(await screen.findByText('Brian B (brian@example.com)')).toBeInTheDocument();
    expect(screen.getByText('Set your password')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/auth/link/redeem')).toBe(false);

    const save = screen.getByRole('button', { name: 'Save password and sign in' });
    await user.type(screen.getByLabelText('New password'), 'plum tractor sideways');
    await user.type(screen.getByLabelText('Type it again'), 'plum tractor sideway');
    expect(screen.getByText("The two passwords don't match.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Type it again'), 's');
    await user.click(save);

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const call = calls.find((c) => c.key === 'POST /api/auth/link/redeem')!;
    expect(body(call.init)).toEqual({ token: 'a'.repeat(43), password: 'plum tractor sideways' });
    expect(window.location.hash).toBe('');
  });

  it('asks for an authenticator code after saving, when the account has one', async () => {
    window.location.hash = '#token=' + 'c'.repeat(43);
    let signedIn = false;
    mockApi({
      'GET /api/auth/me': () => (signedIn ? asAdmin() : signedOut()),
      'POST /api/auth/link/check': () => ({
        status: 201,
        body: { email: 'brian@example.com', displayName: 'Brian B', hasPassword: true },
      }),
      'POST /api/auth/link/redeem': () => ({
        status: 201,
        body: { needsCode: true, token: 'step-token' },
      }),
      'POST /api/auth/sign-in/code': () => {
        signedIn = true;
        return { status: 201, body: asAdmin().body };
      },
      ...home,
    });
    const user = userEvent.setup();
    const router = renderAt('/sign-in');
    expect(await screen.findByText('Reset your password')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), 'plum tractor sideways');
    await user.type(screen.getByLabelText('Type it again'), 'plum tractor sideways');
    await user.click(screen.getByRole('button', { name: 'Save password and sign in' }));
    expect(await screen.findByText(/Password saved\. Your account also uses/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('shows the API’s reason for a weak password', async () => {
    window.location.hash = '#token=' + 'd'.repeat(43);
    mockApi({
      'GET /api/auth/me': signedOut,
      'POST /api/auth/link/check': linkInfo,
      'POST /api/auth/link/redeem': () => ({
        status: 400,
        body: { message: 'That password is too common. A few unrelated words make a strong one.' },
      }),
    });
    const user = userEvent.setup();
    renderAt('/sign-in');
    await user.type(await screen.findByLabelText('New password'), 'password123');
    await user.type(screen.getByLabelText('Type it again'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Save password and sign in' }));
    expect(await screen.findByText(/too common/)).toBeInTheDocument();
  });

  it('says when a link was already used', async () => {
    window.location.hash = '#token=' + 'b'.repeat(43);
    mockApi({
      'GET /api/auth/me': signedOut,
      'POST /api/auth/link/check': () => ({
        status: 404,
        body: {
          message:
            'This password link has expired or was already used. Ask an admin for a new one.',
        },
      }),
    });
    renderAt('/sign-in');
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});

describe('guests in the app', () => {
  const rig = {
    id: 'r1',
    name: 'Rig A',
    primaryUserId: 'p1',
    primaryUserName: 'Ada L.',
    components: { container: null, main: null, reserve: null, aad: null },
  };
  const gear = {
    id: 'g1',
    name: 'Altimeter',
    assignedPersonId: 'p1',
    assignedPersonName: 'Ada L.',
  };
  const guestApi = (extra = {}) =>
    mockApi({
      'GET /api/auth/me': asGuest,
      'GET /api/rigs': () => ({ status: 200, body: [rig] }),
      'GET /api/gear': () => ({ status: 200, body: [gear] }),
      'GET /api/events': empty,
      ...extra,
    });

  it('see Home, Rigs, Gear and Events, a Sign in button, and no People', async () => {
    const calls = guestApi();
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Rigs', 'Gear', 'Events']);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Rigs: 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /People:/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Quick add')).not.toBeInTheDocument();
    expect(calls.some((c) => c.key === 'GET /api/people')).toBe(false);
  });

  it('see people as "First L." and no New, Edit or bulk changes on gear', async () => {
    guestApi();
    const user = userEvent.setup();
    renderAt('/gear');
    expect(await screen.findAllByText(/Ada L\./)).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /New gear/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    // People aren't links for guests (they can't open People).
    expect(screen.queryByRole('link', { name: /Ada L\./ })).not.toBeInTheDocument();
    // Selecting is only for export: no assigning or deleting.
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.queryByRole('button', { name: /Assign to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('see a rig’s person as "First L." with no Edit or Delete', async () => {
    guestApi({ 'GET /api/rigs/r1': () => ({ status: 200, body: { ...rig, media: [] } }) });
    renderAt('/rigs/r1');
    expect(await screen.findByText('Ada L.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ada L.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('are sent home from People and Account', async () => {
    guestApi();
    const router = renderAt('/people');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await router.navigate('/account');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('Sign in ends the guest session and opens the sign-in page', async () => {
    let guest = true;
    guestApi({
      'GET /api/auth/me': () => (guest ? asGuest() : signedOut()),
      'POST /api/auth/logout': () => {
        guest = false;
        return { status: 201, body: { ok: true } };
      },
    });
    const user = userEvent.setup();
    const router = renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});
