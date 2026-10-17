import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asUser, mockApi, renderAt } from './render';

const self = {
  id: 'u1',
  email: 'brian@example.com',
  displayName: 'Brian B',
  roles: ['admin'],
  isActive: true,
  lastLoginAt: '2026-10-01T12:00:00.000Z',
  loginCount: 4,
};
const sam = {
  id: 'u2',
  email: 'sam@example.com',
  displayName: 'Sam Jones',
  roles: ['user'],
  isActive: true,
  lastLoginAt: null,
  loginCount: 0,
};
const ok = (body: unknown) => () => ({ status: 200, body });

describe('users and sign-in', () => {
  it('lists accounts with their roles and sign-in history', async () => {
    mockApi({ 'GET /api/auth/me': asAdmin, 'GET /api/auth/users': ok([self, sam]) });
    renderAt('/users');
    expect(await screen.findByText('Sam Jones')).toBeInTheDocument();
    expect(screen.getByText('Never signed in')).toBeInTheDocument();
    expect(screen.getByText(/Last signed in .* · 4 sign-ins/)).toBeInTheDocument();
    expect(screen.getByText(/Each sign-in link works once and lasts 72 hours/)).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'sam');
    expect(screen.queryByText('Brian B')).not.toBeInTheDocument();
  });

  it('adds a person with the CSRF header', async () => {
    let users: unknown[] = [self];
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/auth/users': () => ({ status: 200, body: users }),
      'POST /api/auth/users': () => {
        users = [self, sam];
        return { status: 201, body: sam };
      },
    });
    renderAt('/users');
    await userEvent.click(await screen.findByRole('button', { name: /Add person/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Sam Jones');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'sam@example.com');
    await userEvent.selectOptions(within(dialog).getByLabelText('Role'), 'admin');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add person' }));

    expect(await screen.findByText('Sam Jones')).toBeInTheDocument();
    const post = calls.find((c) => c.key === 'POST /api/auth/users')!;
    expect(JSON.parse(String(post.init?.body))).toEqual({
      email: 'sam@example.com',
      displayName: 'Sam Jones',
      role: 'admin',
    });
    expect((post.init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
  });

  it('gets a sign-in link to copy, text or email', async () => {
    const link = 'https://rigs.example.com/sign-in#token=abc';
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/auth/users': ok([self, sam]),
      'POST /api/auth/users/u2/link': () => ({
        status: 201,
        body: { link, email: 'sam@example.com', expiresAt: '2026-10-20T12:00:00.000Z' },
      }),
    });
    const user = userEvent.setup();
    renderAt('/users');
    await user.click(await screen.findByRole('button', { name: 'Actions for Sam Jones' }));
    await user.click(await screen.findByRole('menuitem', { name: /Get sign-in link/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Sign-in link for Sam Jones' });
    expect(within(dialog).getByRole('textbox', { name: 'Sign-in link' })).toHaveValue(link);
    expect(within(dialog).getByText(/works once, until/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(link);

    const text = within(dialog).getByRole('link', { name: 'Text' });
    expect(text.getAttribute('href')).toMatch(/^sms:/);
    expect(decodeURIComponent(text.getAttribute('href')!)).toContain(link);
    const email = within(dialog).getByRole('link', { name: 'Email' });
    expect(email.getAttribute('href')).toMatch(/^mailto:sam@example\.com\?subject=Your%20RigTracker/);
    expect(decodeURIComponent(email.getAttribute('href')!)).toContain(link);
  });

  it("doesn't offer to demote yourself, but can make others admins", async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/auth/users': ok([self, sam]),
      'PATCH /api/auth/users/u2/role': ok({ ...sam, roles: ['admin'] }),
    });
    const user = userEvent.setup();
    renderAt('/users');
    await user.click(await screen.findByRole('button', { name: 'Actions for Brian B' }));
    expect(await screen.findByRole('menuitem', { name: /Get sign-in link/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Make user/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Sam Jones' }));
    await user.click(await screen.findByRole('menuitem', { name: /Make admin/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.key === 'PATCH /api/auth/users/u2/role')).toBe(true),
    );
    const patch = calls.find((c) => c.key === 'PATCH /api/auth/users/u2/role')!;
    expect(JSON.parse(String(patch.init?.body))).toEqual({ role: 'admin' });
  });

  it('signs someone out everywhere after asking', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/auth/users': ok([self, sam]),
      'POST /api/auth/users/u2/sign-out': ok({ ok: true }),
    });
    const user = userEvent.setup();
    renderAt('/users');
    await user.click(await screen.findByRole('button', { name: 'Actions for Sam Jones' }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign out everywhere/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign out everywhere?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.key === 'POST /api/auth/users/u2/sign-out')).toBe(true);
  });

  it('sends non-admins home', async () => {
    mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/rigs': ok([]),
      'GET /api/events': ok([]),
      'GET /api/gear': ok([]),
      'GET /api/people': ok([]),
    });
    const router = renderAt('/users');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByText('Users and sign-in')).not.toBeInTheDocument();
  });
});
