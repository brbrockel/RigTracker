import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asViewer, mockApi, renderAt } from './render';

const DAY = 86_400_000;
const isoIn = (days: number) =>
  new Date(Date.now() + days * DAY).toISOString().slice(0, 10) + 'T00:00:00.000Z';

const people = [
  { id: 'p1', firstName: 'Ann', lastName: 'Jumper' },
  { id: 'p2', firstName: 'Bob', lastName: 'Flyer' },
];
const rigs = [
  {
    id: 'r1',
    number: '3',
    name: 'Blue',
    primaryUserId: 'p1',
    repackDue: isoIn(-5),
    components: {
      container: null,
      main: null,
      reserve: {
        id: 'g5',
        name: 'Smart 150',
        type: 'Reserve',
        serialNumber: 'RES-111',
        dateOfManufacture: '2015-03-01',
        imageUrl: null,
      },
      aad: null,
    },
  },
  { id: 'r2', number: '4', name: 'Green', primaryUserId: 'p2', repackDue: isoIn(10) },
  { id: 'r3', name: 'Spare', repackDue: isoIn(120) },
];
const gear = [
  {
    id: 'g1',
    name: 'Altimeter',
    type: 'Altimeter',
    serialNumber: 'ALT-1',
    assignedRigId: 'r1',
    assignedPersonId: 'p1',
  },
  { id: 'g2', name: 'Helmet', type: 'Helmet', serialNumber: 'HEL-1' },
  {
    id: 'g5',
    name: 'Smart 150',
    type: 'Reserve',
    serialNumber: 'RES-111',
    assignedRigId: 'r1',
    assignedPersonId: 'p1',
    slot: 'reserve',
  },
  { id: 'g6', name: 'Storm 150', type: 'Main', serialNumber: 'ST-150' },
];

const lists = {
  'GET /api/rigs': () => ({ status: 200, body: rigs }),
  'GET /api/people': () => ({ status: 200, body: people }),
  'GET /api/gear': () => ({ status: 200, body: gear }),
};

describe('rigs list', () => {
  // These check the card layout; the other layouts are covered in inventory.test.tsx.
  beforeEach(() => localStorage.setItem('rigtracker.view.rigs', JSON.stringify({ view: 'cards' })));

  it('lists rigs with person and repack status, and search filters them', async () => {
    mockApi({ 'GET /api/auth/me': asAdmin, ...lists });
    renderAt('/rigs');
    expect(await screen.findByText('#3 · Blue')).toBeInTheDocument();
    expect(screen.getByText('Ann Jumper')).toBeInTheDocument();
    expect(screen.getByText(/Repack overdue/, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Repack due in 10 days')).toBeInTheDocument();
    expect(screen.getByText('No primary person', { selector: 'div' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search rigs'), 'bob');
    expect(screen.getByText('#4 · Green')).toBeInTheDocument();
    expect(screen.queryByText('#3 · Blue')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search rigs'));
    await userEvent.type(screen.getByLabelText('Search rigs'), 'res-111');
    expect(screen.getByText('#3 · Blue')).toBeInTheDocument();
    expect(screen.queryByText('#4 · Green')).not.toBeInTheDocument();

    // Component names match too.
    await userEvent.clear(screen.getByLabelText('Search rigs'));
    await userEvent.type(screen.getByLabelText('Search rigs'), 'smart 150');
    expect(screen.getByText('#3 · Blue')).toBeInTheDocument();
    expect(screen.queryByText('#4 · Green')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search rigs'));
    await userEvent.selectOptions(screen.getByLabelText('Filter rigs'), 'nobody');
    expect(screen.getByText('Spare')).toBeInTheDocument();
    expect(screen.queryByText('#3 · Blue')).not.toBeInTheDocument();
  });

  it('shows viewers no New rig or actions menu', async () => {
    mockApi({ 'GET /api/auth/me': asViewer, ...lists });
    renderAt('/rigs');
    expect(await screen.findByText('#3 · Blue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New rig/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('lets an admin add a rig, sending the fields with the CSRF token', async () => {
    let created = false;
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'POST /api/rigs': () => {
        created = true;
        return { status: 201, body: { id: 'r9', name: 'Red' } };
      },
    });
    renderAt('/rigs');
    await userEvent.click(await screen.findByRole('button', { name: /New rig/ }));
    const dialog = await screen.findByRole('dialog');
    // Components are gear, set on the rig's page.
    expect(within(dialog).queryByLabelText('Serial number')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Container')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Red');
    await userEvent.type(within(dialog).getByLabelText('Number'), '7');
    await userEvent.selectOptions(within(dialog).getByLabelText('Primary person'), 'p2');
    fireEvent.change(within(dialog).getByLabelText('Repack due'), {
      target: { value: '2026-12-01' },
    });
    await userEvent.type(within(dialog).getByLabelText('Rigger initials'), 'BB');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add rig' }));

    await waitFor(() => expect(created).toBe(true));
    const post = calls.find((c) => c.key === 'POST /api/rigs')!;
    expect(JSON.parse(post.init!.body as string)).toEqual({
      name: 'Red',
      number: '7',
      primaryUserId: 'p2',
      repackDue: '2026-12-01',
      riggerINT: 'BB',
    });
    expect((post.init!.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('rig page', () => {
  it('shows the rig details and the gear on it', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
    });
    renderAt('/rigs/r1');
    expect(await screen.findByRole('heading', { name: '#3 · Blue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ann Jumper' })).toHaveAttribute('href', '/people/p1');
    // Components: the reserve is filled, the other slots are empty.
    const reserve = screen.getByRole('listitem', { name: 'Reserve' });
    expect(within(reserve).getByText('Smart 150')).toBeInTheDocument();
    expect(within(reserve).getByText(/S\/N RES-111 · Made Mar 1, 2015/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('listitem', { name: 'Main' })).getByText('No Main'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Container' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add AAD' })).toBeInTheDocument();
    // Other gear on the rig: not its components.
    expect(await screen.findByText('Altimeter', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(screen.getAllByText('Smart 150')).toHaveLength(1);
    expect(screen.queryByText('Helmet', { selector: 'span.truncate' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assign gear/ })).toBeInTheDocument();
  });

  it('shows viewers the components without Add or actions', async () => {
    mockApi({
      'GET /api/auth/me': asViewer,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
    });
    renderAt('/rigs/r1');
    expect(await screen.findByText('No Main')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('fills an empty slot with existing gear, matching type first', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
      'PUT /api/gear/g6': (init) => {
        body = JSON.parse(init!.body as string);
        return { status: 200, body: {} };
      },
    });
    renderAt('/rigs/r1');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Main' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add main' });
    const select = within(dialog).getByLabelText('Gear');
    const unassigned = within(select).getByRole('group', { name: 'Unassigned' });
    // The Main comes before the helmet.
    expect(
      within(unassigned)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Storm 150 · Main · S/N ST-150', 'Helmet · Helmet · S/N HEL-1']);
    expect(within(select).getByRole('group', { name: 'On this rig' })).toBeInTheDocument();
    await userEvent.selectOptions(select, 'g6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body).toEqual({ assignedRigId: 'r1', slot: 'main' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('adds new gear into a slot, with the slot’s type', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
      'POST /api/gear': (init) => {
        body = JSON.parse(init!.body as string);
        return { status: 201, body: { id: 'g9' } };
      },
    });
    renderAt('/rigs/r1');
    await userEvent.click(await screen.findByRole('button', { name: 'Add AAD' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add aad' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'New gear' }));
    expect(within(dialog).getByLabelText('Type')).toHaveValue('AAD');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Vigil Cuatro');
    await userEvent.type(within(dialog).getByLabelText('Serial number'), '62715');
    fireEvent.change(within(dialog).getByLabelText('Date of manufacture'), {
      target: { value: '2019-05-01' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(body).toEqual({
        name: 'Vigil Cuatro',
        type: 'AAD',
        serialNumber: '62715',
        dateOfManufacture: '2019-05-01',
        assignedRigId: 'r1',
        slot: 'aad',
      }),
    );
  });

  it('shows the API’s refusal when a slot can’t be filled', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
      'PUT /api/gear/g6': () => ({ status: 409, body: { message: 'Rig #3 already has a main' } }),
    });
    renderAt('/rigs/r1');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Main' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Gear'), 'g6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Rig #3 already has a main')).toBeInTheDocument();
  });

  it('changes a component: the old one stays on the rig as other gear', async () => {
    const puts: Array<[string, unknown]> = [];
    const put = (id: string) => (init: RequestInit | undefined) => {
      puts.push([id, JSON.parse(init!.body as string)]);
      return { status: 200, body: {} };
    };
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
      'PUT /api/gear/g5': put('g5'),
      'PUT /api/gear/g2': put('g2'),
    });
    renderAt('/rigs/r1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Reserve: Smart 150' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: /Change/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Change reserve' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Gear'), 'g2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(puts).toEqual([
        ['g5', { slot: null }],
        ['g2', { assignedRigId: 'r1', slot: 'reserve' }],
      ]),
    );
  });

  it('takes a component off the rig', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
      'PUT /api/gear/g5': (init) => {
        body = JSON.parse(init!.body as string);
        return { status: 200, body: {} };
      },
    });
    renderAt('/rigs/r1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Reserve: Smart 150' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: /Take off rig/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Take off rig' }));
    await waitFor(() => expect(body).toEqual({ assignedRigId: null, assignedPersonId: null }));
  });

  it('assigns unassigned gear to the rig', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/r1': () => ({ status: 200, body: rigs[0] }),
      'PUT /api/gear/g2': (init) => {
        body = JSON.parse(init!.body as string);
        return { status: 200, body: {} };
      },
    });
    renderAt('/rigs/r1');
    await userEvent.click(await screen.findByRole('button', { name: /Assign gear/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Gear'), 'g2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(body).toEqual({ assignedRigId: 'r1' }));
  });

  it('says when a rig does not exist', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'GET /api/rigs/nope': () => ({ status: 404, body: { message: 'Rig not found' } }),
    });
    renderAt('/rigs/nope');
    expect(await screen.findByText(/Rig not found/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all rigs' })).toHaveAttribute('href', '/rigs');
  });
});
