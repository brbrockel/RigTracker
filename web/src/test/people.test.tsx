import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asUser, asViewer, mockApi, renderAt } from './render';

const people = [
  {
    _id: 'p1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+18605551234',
  },
  { _id: 'p2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.mil' },
];
const ok = (body: unknown) => () => ({ status: 200, body });

// Brian (u1) is the signed-in admin; Sam can sign in; Kim has no email and no sign-in.
const self = {
  _id: 'u1',
  firstName: 'Brian',
  lastName: 'B',
  email: 'brian@example.com',
  roles: ['admin'],
  isActive: true,
  lastLoginAt: '2026-10-01T12:00:00.000Z',
  loginCount: 4,
};
const sam = {
  _id: 'p3',
  firstName: 'Sam',
  lastName: 'Jones',
  email: 'sam@example.com',
  roles: ['user'],
  isActive: true,
  lastLoginAt: null,
  loginCount: 0,
};
const kim = { _id: 'p4', firstName: 'Kim', lastName: 'Lee', roles: [] };
const everyone = [...people, self, sam, kim];
const card = (name: string) => screen.getByRole('link', { name }).closest('li')!;

describe('people', () => {
  it('lists people with contact links and filters by search', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': () => ({ status: 200, body: people }),
    });
    renderAt('/people');
    expect(await screen.findByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/people/p1',
    );
    expect(screen.getByRole('link', { name: 'Grace Hopper' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call (860) 555-1234' })).toHaveAttribute(
      'href',
      'tel:+18605551234',
    );
    expect(screen.getByRole('link', { name: 'Text (860) 555-1234' })).toHaveAttribute(
      'href',
      'sms:+18605551234',
    );
    expect(screen.getByRole('link', { name: /grace@navy.mil/ })).toHaveAttribute(
      'href',
      'mailto:grace@navy.mil',
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), 'navy');
    expect(screen.queryByRole('link', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Grace Hopper' })).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: 'Search people' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), '555-12');
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Grace Hopper' })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: 'Search people' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), 'zzz');
    expect(screen.getByText('No one matches.')).toBeInTheDocument();
  });

  it('blocks a bad email or phone, then saves the phone as E.164 with the CSRF header', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': () => ({ status: 200, body: people }),
      'POST /api/people': () => ({ status: 201, body: { _id: 'p3', firstName: 'Kay' } }),
    });
    renderAt('/people');
    await userEvent.click(await screen.findByRole('button', { name: /New person/ }));
    const dialog = await screen.findByRole('dialog');
    const d = within(dialog);
    await userEvent.type(d.getByLabelText('First name'), 'Kay');
    await userEvent.type(d.getByLabelText('Last name'), 'Jumper');
    await userEvent.type(d.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(d.getByLabelText('Phone'), '555-12');
    await userEvent.click(d.getByRole('button', { name: 'Save' }));
    expect(d.getByText('Enter a valid email')).toBeInTheDocument();
    expect(d.getByText(/10-digit US number/)).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/people')).toBe(false);

    await userEvent.clear(d.getByLabelText('Email'));
    await userEvent.type(d.getByLabelText('Email'), 'Kay@Example.com ');
    await userEvent.clear(d.getByLabelText('Phone'));
    await userEvent.type(d.getByLabelText('Phone'), '(860) 555-9876');
    await userEvent.click(d.getByRole('button', { name: 'Add contact' }));
    await userEvent.type(d.getByLabelText('Contact 1 name'), 'Mom');
    await userEvent.type(d.getByLabelText('Contact 1 phone'), '1 203 555 0000');
    await userEvent.type(d.getByLabelText('Contact 1 relation'), 'Mother');
    await userEvent.click(d.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.key === 'POST /api/people')).toBe(true));
    const post = calls.find((c) => c.key === 'POST /api/people')!;
    expect((post.init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    const body = JSON.parse(String(post.init?.body));
    expect(body).toMatchObject({
      firstName: 'Kay',
      lastName: 'Jumper',
      email: 'kay@example.com',
      phone: '+18605559876',
      emergencyContacts: [{ name: 'Mom', phone: '+12035550000', relation: 'Mother' }],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows viewers no New or Edit', async () => {
    mockApi({
      'GET /api/auth/me': asViewer,
      'GET /api/people': () => ({ status: 200, body: people }),
    });
    renderAt('/people');
    expect(await screen.findByRole('link', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New person/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('shows a person with their rigs and gear, and assigns gear', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people/p1': () => ({
        status: 200,
        body: {
          ...people[0],
          dob: '1990-03-04T00:00:00.000Z',
          address: { line1: '1 Main St', city: 'Hartford', state: 'CT', zip: '06101' },
          emergencyContacts: [{ name: 'Bob', phone: '+12035550000', relation: 'Brother' }],
        },
      }),
      'GET /api/people': () => ({ status: 200, body: people }),
      'GET /api/rigs': () => ({
        status: 200,
        body: [
          { _id: 'r1', name: 'Javelin', number: '7', primaryUserId: 'p1' },
          { _id: 'r2', name: 'Other', primaryUserId: 'p2' },
        ],
      }),
      'GET /api/gear': () => ({
        status: 200,
        body: [
          { _id: 'g1', name: 'Altimeter', assignedPersonId: 'p1' },
          { _id: 'g2', name: 'Helmet' },
        ],
      }),
      'PUT /api/gear/g2': () => ({ status: 200, body: {} }),
    });
    renderAt('/people/p1');
    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText('Mar 4, 1990')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call Bob' })).toHaveAttribute(
      'href',
      'tel:+12035550000',
    );
    expect(await screen.findByRole('link', { name: /#7 · Javelin/ })).toHaveAttribute(
      'href',
      '/rigs/r1',
    );
    expect(screen.queryByText(/Other/)).not.toBeInTheDocument();
    expect(await screen.findByText('Altimeter')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Assign gear/ }));
    await userEvent.selectOptions(await screen.findByLabelText('Gear'), 'g2');
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'PUT /api/gear/g2')).toBe(true));
    const put = calls.find((c) => c.key === 'PUT /api/gear/g2')!;
    expect(JSON.parse(String(put.init?.body))).toEqual({
      assignedRigId: null,
      assignedPersonId: 'p1',
    });
  });

  it('says when a person is missing', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people/nope': () => ({ status: 404, body: { message: 'Person not found' } }),
      'GET /api/rigs': () => ({ status: 200, body: [] }),
      'GET /api/gear': () => ({ status: 200, body: [] }),
    });
    renderAt('/people/nope');
    expect(await screen.findByText('Person not found')).toBeInTheDocument();
  });

  it('shows role badges, You and sign-in history, and filters by access', async () => {
    mockApi({ 'GET /api/auth/me': asAdmin, 'GET /api/people': ok(everyone) });
    renderAt('/people');
    await screen.findByRole('link', { name: 'Sam Jones' });
    const me = within(card('Brian B'));
    expect(me.getByText('You')).toBeInTheDocument();
    expect(me.getByText('Admin')).toHaveClass('text-primary');
    expect(me.getByText(/Last signed in .* · 4 sign-ins/)).toBeInTheDocument();
    expect(within(card('Sam Jones')).getByText('User')).toBeInTheDocument();
    expect(within(card('Sam Jones')).getByText('Never signed in')).toBeInTheDocument();
    expect(
      within(card('Ada Lovelace')).queryByText(/signed in|Admin|User|Viewer/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Each sign-in link works once and lasts\s+72 hours/),
    ).toBeInTheDocument();

    const filter = screen.getByRole('combobox', { name: 'Filter people' });
    await userEvent.selectOptions(filter, 'sign-in');
    expect(screen.getByRole('link', { name: 'Sam Jones' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brian B' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Kim Lee' })).not.toBeInTheDocument();
    await userEvent.selectOptions(filter, 'admin');
    expect(screen.queryByRole('link', { name: 'Sam Jones' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brian B' })).toBeInTheDocument();
    await userEvent.selectOptions(filter, 'none');
    expect(screen.getByRole('link', { name: 'Kim Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Brian B' })).not.toBeInTheDocument();
  });

  it('gives someone sign-in access with the CSRF header', async () => {
    let list: unknown[] = everyone;
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': () => ({ status: 200, body: list }),
      'PATCH /api/auth/people/p1/access': () => {
        const updated = { ...people[0], roles: ['user'], isActive: true, loginCount: 0 };
        list = [updated, ...everyone.slice(1)];
        return { status: 200, body: updated };
      },
    });
    const user = userEvent.setup();
    renderAt('/people');
    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    expect(screen.queryByRole('menuitem', { name: /Get sign-in link/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('menuitem', { name: /Sign-in access/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign-in access for Ada Lovelace' });
    expect(within(dialog).getByText(/needs an email address/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Access'), 'user');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patch = calls.find((c) => c.key === 'PATCH /api/auth/people/p1/access')!;
    expect(JSON.parse(String(patch.init?.body))).toEqual({ role: 'user' });
    expect((patch.init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    expect(await within(card('Ada Lovelace')).findByText('User')).toBeInTheDocument();
  });

  it('shows the API error when the person has no email', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': ok(everyone),
      'PATCH /api/auth/people/p4/access': () => ({
        status: 400,
        body: { message: 'Add an email address before giving sign-in access' },
      }),
    });
    const user = userEvent.setup();
    renderAt('/people');
    await user.click(await screen.findByRole('button', { name: 'Actions for Kim Lee' }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign-in access/ }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Access'), 'viewer');
    expect(within(dialog).getByText(/has no email address yet/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('Add an email address before giving sign-in access'),
    ).toBeInTheDocument();
  });

  it('gets a sign-in link to copy, text or email', async () => {
    const link = 'https://rigs.example.com/sign-in#token=abc';
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': ok(everyone),
      'POST /api/auth/people/p3/link': () => ({
        status: 201,
        body: { link, email: 'sam@example.com', expiresAt: '2026-10-20T12:00:00.000Z' },
      }),
    });
    const user = userEvent.setup();
    renderAt('/people');
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
    expect(email.getAttribute('href')).toMatch(
      /^mailto:sam@example\.com\?subject=Your%20RigTracker/,
    );
    expect(decodeURIComponent(email.getAttribute('href')!)).toContain(link);
  });

  it('signs someone out everywhere after asking', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': ok(everyone),
      'POST /api/auth/people/p3/sign-out': ok({ ok: true }),
    });
    const user = userEvent.setup();
    renderAt('/people');
    await user.click(await screen.findByRole('button', { name: 'Actions for Sam Jones' }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign out everywhere/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign out everywhere?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.key === 'POST /api/auth/people/p3/sign-out')).toBe(true);
  });

  it("can't remove your own admin role or delete yourself", async () => {
    mockApi({ 'GET /api/auth/me': asAdmin, 'GET /api/people': ok(everyone) });
    const user = userEvent.setup();
    renderAt('/people');
    await user.click(await screen.findByRole('button', { name: 'Actions for Brian B' }));
    expect(await screen.findByRole('menuitem', { name: /Get sign-in link/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Sign-in access/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/can't remove your own admin role/)).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'No sign-in' })).toBeDisabled();
    expect(within(dialog).getByRole('option', { name: /^User/ })).toBeDisabled();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Actions for Sam Jones' }));
    expect(await screen.findByRole('menuitem', { name: /Delete/ })).toBeInTheDocument();
  });

  it('shows access on the person page, with no Delete for yourself', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people/u1': ok(self),
      'GET /api/rigs': ok([]),
      'GET /api/gear': ok([]),
    });
    const user = userEvent.setup();
    renderAt('/people/u1');
    expect(await screen.findByRole('heading', { name: 'Brian B' })).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText(/Last signed in .* · 4 sign-ins/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Brian B' }));
    expect(await screen.findByRole('menuitem', { name: /Sign-in access/ })).toBeInTheDocument();
  });

  it('requires an email for someone who signs in', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': ok(everyone),
      'PUT /api/people/p3': ok(sam),
    });
    const user = userEvent.setup();
    renderAt('/people');
    await user.click(await screen.findByRole('button', { name: 'Actions for Sam Jones' }));
    await user.click(await screen.findByRole('menuitem', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Used to sign in')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Email'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText(/Enter an email address/)).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'PUT /api/people/p3')).toBe(false);
  });

  it('shows non-admins badges but no sign-in actions', async () => {
    mockApi({ 'GET /api/auth/me': asUser, 'GET /api/people': ok(everyone) });
    const user = userEvent.setup();
    renderAt('/people');
    await screen.findByRole('link', { name: 'Sam Jones' });
    expect(within(card('Sam Jones')).getByText('User')).toBeInTheDocument();
    expect(screen.queryByText(/signed in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sign-in link works once/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Sam Jones' }));
    expect(await screen.findByRole('menuitem', { name: /Edit/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Sign-in access/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Get sign-in link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Sign out everywhere/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('sends /users to People', async () => {
    mockApi({ 'GET /api/auth/me': asAdmin, 'GET /api/people': ok(everyone) });
    const router = renderAt('/users');
    await waitFor(() => expect(router.state.location.pathname).toBe('/people'));
    expect(await screen.findByRole('link', { name: 'Sam Jones' })).toBeInTheDocument();
    expect(screen.queryByText('Users and sign-in')).not.toBeInTheDocument();
  });
});
