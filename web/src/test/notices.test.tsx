import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asGuest, asUser, mockApi, renderAt } from './render';

const LIST = 'GET /api/notices?limit=50';
const BANNERS = 'GET /api/notices/banners';
const ok = (body: unknown) => () => ({ status: 200, body });

const notice = (over: object = {}) => ({
  id: 'n1',
  title: 'Rigging day Saturday',
  body: 'Hangar 2 at 9.',
  audience: 'everyone',
  recipientId: null,
  pinned: false,
  to: 'Everyone',
  author: 'Brian B',
  createdAt: new Date().toISOString(),
  updatedAt: null,
  read: false,
  dismissed: false,
  banner: true,
  dismissible: true,
  urgent: false,
  bannerUntil: new Date(Date.now() + 6 * 86_400_000).toISOString(),
  ...over,
});
const banner = (over: object = {}) => ({
  id: 'n1',
  automatic: false,
  title: 'Rigging day Saturday',
  body: 'Hangar 2 at 9.',
  label: 'Everyone',
  urgent: false,
  dismissible: true,
  read: false,
  link: null,
  createdAt: new Date().toISOString(),
  ...over,
});

/** Home's own requests. */
const home = {
  'GET /api/rigs': ok([]),
  'GET /api/events': ok([]),
  'GET /api/gear': ok([]),
  'GET /api/people': ok([
    { id: 'p1', firstName: 'Ada', lastName: 'Lovelace', phone: '+18605551234', roles: ['user'] },
    { id: 'p2', firstName: 'Grace', lastName: 'Hopper', roles: ['viewer'] },
  ]),
};

describe('notice banners', () => {
  it('stack with a count, fan out on tap and fold back; most urgent on top', async () => {
    mockApi({
      'GET /api/auth/me': asUser,
      ...home,
      [BANNERS]: ok([
        banner({ id: 'n9', title: 'Must see: new waiver', urgent: true, label: 'Everyone' }),
        banner({
          id: 'repack:r1:2026-10-01',
          automatic: true,
          title: 'Rig #6 repack overdue since Oct 1',
          urgent: true,
          label: 'Your rig',
          link: '/rigs/r1',
          read: true,
          body: '',
        }),
        banner({ id: 'n1' }),
        banner({ id: 'n2', title: 'Pizza after' }),
      ]),
    });
    renderAt('/');
    const bar = await screen.findByRole('region', { name: 'Notices' });
    // Stacked: only the top one, with a count of the rest.
    expect(within(bar).getAllByRole('button', { expanded: false })).toHaveLength(1);
    expect(within(bar).getByText('Must see: new waiver')).toBeInTheDocument();
    expect(within(bar).getByText('+3')).toBeInTheDocument();
    expect(within(bar).queryByText('Pizza after')).toBeNull();

    await userEvent.click(within(bar).getByRole('button', { name: 'Show all 4 notices' }));
    expect(
      within(bar)
        .getAllByRole('button', { expanded: false })
        .map((r) => r.textContent),
    ).toEqual([
      'Must see: new waiverEveryone',
      'Rig #6 repack overdue since Oct 1Your rig',
      'Rigging day SaturdayEveryone',
      'Pizza afterEveryone',
    ]);
    expect(within(bar).getAllByRole('alert')).toHaveLength(2);
    await userEvent.click(within(bar).getByRole('button', { name: 'Show less' }));
    expect(within(bar).getAllByRole('button', { name: /^Dismiss/ })).toHaveLength(1);
  });

  it('tap for the full text (marks it read); ✕ dismisses a notice or a repack reminder', async () => {
    let banners = [
      banner({ id: 'n1' }),
      banner({
        id: 'repack:r1:2026-10-30',
        automatic: true,
        title: 'Rig #6 repack due Oct 30',
        label: 'Your rig',
        link: '/rigs/r1',
        read: true,
        body: '',
      }),
    ];
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      ...home,
      [BANNERS]: () => ({ status: 200, body: banners }),
      'POST /api/notices/read': ok({ ok: true }),
      'POST /api/notices/dismiss': (init) => {
        const sent = JSON.parse(String(init?.body)) as { ids?: string[]; keys?: string[] };
        banners = banners.filter((b) => !sent.ids?.includes(b.id) && !sent.keys?.includes(b.id));
        return { status: 200, body: { ok: true } };
      },
    });
    renderAt('/');
    const bar = await screen.findByRole('region', { name: 'Notices' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Show all 2 notices' }));
    await userEvent.click(within(bar).getByRole('button', { name: /^Rigging day Saturday/ }));
    expect(within(bar).getByText('Hangar 2 at 9.')).toBeInTheDocument();
    const read = calls.find((c) => c.key === 'POST /api/notices/read');
    expect(JSON.parse(String(read?.init?.body))).toEqual({ ids: ['n1'] });

    await userEvent.click(within(bar).getByRole('button', { name: /^Rig #6 repack due Oct 30/ }));
    expect(within(bar).getByRole('link', { name: /Open the rig/ })).toHaveAttribute(
      'href',
      '/rigs/r1',
    );

    await userEvent.click(
      within(bar).getByRole('button', { name: 'Dismiss Rig #6 repack due Oct 30' }),
    );
    const dismissed = calls.find((c) => c.key === 'POST /api/notices/dismiss');
    expect(JSON.parse(String(dismissed?.init?.body))).toEqual({ keys: ['repack:r1:2026-10-30'] });
    await userEvent.click(
      within(bar).getByRole('button', { name: 'Dismiss Rigging day Saturday' }),
    );
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Notices' })).toBeNull());
    const last = calls.filter((c) => c.key === 'POST /api/notices/dismiss').at(-1);
    expect(JSON.parse(String(last?.init?.body))).toEqual({ ids: ['n1'] });
  });
});

describe('the horn and the notices panel', () => {
  it('counts what is new and not already a banner; marks all read', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      ...home,
      [LIST]: ok([
        notice({ id: 'n1', banner: false, title: 'Dues are $40' }),
        notice({ id: 'n2', banner: true }),
        notice({ id: 'n3', read: true, banner: false, title: 'Old news' }),
      ]),
      'POST /api/notices/read': ok({ ok: true }),
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Notices (1 new)' }));
    const panel = await screen.findByRole('dialog', { name: 'Notices' });
    expect(within(panel).getByText('Dues are $40')).toBeInTheDocument();
    expect(within(panel).getByText('Old news')).toBeInTheDocument();
    // Users don't post.
    expect(within(panel).queryByRole('button', { name: /New notice/ })).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: /Mark all read/ }));
    const read = calls.find((c) => c.key === 'POST /api/notices/read');
    expect(JSON.parse(String(read?.init?.body))).toEqual({ ids: ['n1', 'n2'] });
  });

  it('a Home strip shows only while something is new that is not a banner', async () => {
    mockApi({
      'GET /api/auth/me': asUser,
      ...home,
      [LIST]: ok([
        notice({ id: 'n1', banner: false, title: 'Missed this one' }),
        notice({ id: 'n2', banner: true }),
      ]),
      'POST /api/notices/read': ok({ ok: true }),
    });
    renderAt('/');
    const strip = await screen.findByRole('region', { name: 'New notices' });
    expect(strip).toHaveTextContent('New notice:Missed this one');
    await userEvent.click(within(strip).getByRole('button', { name: /Missed this one/ }));
    expect(within(strip).getByRole('button', { expanded: true })).toBeInTheDocument();
  });

  it('no strip when nothing is new', async () => {
    mockApi({
      'GET /api/auth/me': asUser,
      ...home,
      [LIST]: ok([notice({ read: true, banner: false })]),
    });
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'Notices' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'New notices' })).toBeNull();
  });

  it('admins post to one person and then text it; people without a phone are counted', async () => {
    const posts: unknown[] = [];
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...home,
      'POST /api/notices': (init) => {
        posts.push(JSON.parse(String(init?.body)));
        return { status: 201, body: { id: 'new', phones: ['+18605551234'], skipped: 2 } };
      },
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Notices' }));
    const panel = await screen.findByRole('dialog', { name: 'Notices' });
    await userEvent.click(within(panel).getByRole('button', { name: /New notice/ }));
    await userEvent.selectOptions(within(panel).getByLabelText('For'), 'person');
    await userEvent.selectOptions(await within(panel).findByLabelText('Person'), 'p1');
    await userEvent.type(within(panel).getByLabelText('Title (optional)'), 'Your reserve');
    await userEvent.type(within(panel).getByLabelText('Notice'), 'Due Friday.');
    await userEvent.click(within(panel).getByLabelText(/Must see/));
    await userEvent.type(within(panel).getByLabelText('Banner until'), '2026-11-01');
    await userEvent.click(within(panel).getByRole('button', { name: 'Post' }));
    expect(posts[0]).toEqual({
      title: 'Your reserve',
      body: 'Due Friday.',
      audience: 'person',
      recipientId: 'p1',
      pinned: true,
      bannerUntil: new Date('2026-11-01T23:59:59.999').toISOString(),
    });
    const text = await within(panel).findByRole('link', { name: /Also text it \(1\)/ });
    const href = decodeURIComponent(text.getAttribute('href')!);
    expect(href).toMatch(/^sms:\+18605551234[?&]body=Your reserve\n\nDue Friday\.$/);
    expect(
      within(panel).getByText(/2 people have no mobile number and are skipped/),
    ).toBeInTheDocument();
  });

  it('admins post to everyone (the default) and the public', async () => {
    const posts: unknown[] = [];
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...home,
      'POST /api/notices': (init) => {
        posts.push(JSON.parse(String(init?.body)));
        return { status: 201, body: { id: 'new', phones: [], skipped: 0 } };
      },
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Notices' }));
    const panel = await screen.findByRole('dialog', { name: 'Notices' });
    await userEvent.click(within(panel).getByRole('button', { name: /New notice/ }));
    expect(within(panel).getByLabelText('For')).toHaveValue('everyone');
    await userEvent.selectOptions(within(panel).getByLabelText('For'), 'public');
    await userEvent.type(within(panel).getByLabelText('Notice'), 'Open day Sunday');
    await userEvent.click(within(panel).getByRole('button', { name: 'Post' }));
    expect(posts[0]).toEqual({ body: 'Open day Sunday', audience: 'public', pinned: false });
    // Nobody to text: the form just closes.
    await waitFor(() => expect(within(panel).queryByLabelText('Notice')).toBeNull());
  });

  it('admins edit, delete and text an existing notice', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      ...home,
      [LIST]: ok([notice({ read: true, banner: false })]),
      'GET /api/notices/n1/phones': ok({ phones: ['+18605551234', '+18605550000'], skipped: 0 }),
      'PATCH /api/notices/n1': ok(notice()),
      'DELETE /api/notices/n1': ok({ ok: true }),
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Notices' }));
    const panel = await screen.findByRole('dialog', { name: 'Notices' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Text Rigging day Saturday' }));
    const link = await within(panel).findByRole('link', { name: /Send the text \(2\)/ });
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('+18605551234,+18605550000');

    await userEvent.click(within(panel).getByRole('button', { name: 'Edit Rigging day Saturday' }));
    const body = within(panel).getByLabelText('Notice');
    await userEvent.clear(body);
    await userEvent.type(body, 'Hangar 3 at 10.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    const patch = calls.find((c) => c.key === 'PATCH /api/notices/n1');
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      title: 'Rigging day Saturday',
      body: 'Hangar 3 at 10.',
      pinned: false,
    });

    await userEvent.click(
      await within(panel).findByRole('button', { name: 'Delete Rigging day Saturday' }),
    );
    const confirm = await screen.findByRole('dialog', { name: 'Delete this notice?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /api/notices/n1')).toBe(true));
  });
});

describe('People → Send notice', () => {
  it('opens a notice already for that person', async () => {
    const posts: unknown[] = [];
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': home['GET /api/people'],
      'POST /api/notices': (init) => {
        posts.push(JSON.parse(String(init?.body)));
        return { status: 201, body: { id: 'new', phones: ['+18605551234'], skipped: 0 } };
      },
    });
    renderAt('/people');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Send notice/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New notice' });
    expect(dialog).toHaveTextContent('For Ada Lovelace');
    expect(within(dialog).queryByLabelText('For')).toBeNull();
    await userEvent.type(within(dialog).getByLabelText('Notice'), 'Your rig is ready.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Post' }));
    expect(posts[0]).toEqual({
      body: 'Your rig is ready.',
      audience: 'person',
      recipientId: 'p1',
      pinned: false,
    });
    expect(
      await within(dialog).findByRole('link', { name: /Also text it \(1\)/ }),
    ).toBeInTheDocument();
  });
});

describe('guests', () => {
  it('see public notices as banners and in the horn; dismissing is kept in the browser', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asGuest,
      'GET /api/rigs': ok([]),
      'GET /api/events': ok([]),
      'GET /api/gear': ok([]),
      [BANNERS]: ok([banner({ id: 'n5', title: 'Open day Sunday', label: 'RigTracker' })]),
      [LIST]: ok([
        notice({
          id: 'n5',
          title: 'Open day Sunday',
          audience: 'public',
          to: 'RigTracker',
          author: null,
        }),
      ]),
    });
    renderAt('/');
    const bar = await screen.findByRole('region', { name: 'Notices' });
    await userEvent.click(within(bar).getByRole('button', { name: /^Open day Sunday/ }));
    await userEvent.click(within(bar).getByRole('button', { name: 'Dismiss Open day Sunday' }));
    expect(screen.queryByRole('region', { name: 'Notices' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('rigtracker.notices.dismissed')!)).toEqual(['n5']);
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Notices' }));
    const panel = await screen.findByRole('dialog', { name: 'Notices' });
    expect(within(panel).getByText('Open day Sunday')).toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: /New notice|Mark all read|Edit/ }),
    ).toBeNull();
    expect(screen.queryByRole('region', { name: 'New notices' })).toBeNull();
  });
});

describe('Rigs from the repack banner', () => {
  it('?filter=repack shows rigs overdue or due within 14 days', async () => {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': ok([]),
      'GET /api/rigs': ok([
        { id: 'r1', name: 'Late', repackDue: day(-3) },
        { id: 'r2', name: 'Soon', repackDue: day(10) },
        { id: 'r3', name: 'Later', repackDue: day(25) },
      ]),
    });
    renderAt('/rigs?filter=repack');
    expect(await screen.findByLabelText('Filter rigs')).toHaveValue('repack');
    expect((await screen.findAllByText('Late')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Soon').length).toBeGreaterThan(0);
    expect(screen.queryByText('Later')).toBeNull();
  });
});
