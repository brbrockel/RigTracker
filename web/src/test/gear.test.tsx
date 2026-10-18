import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asUser, asViewer, mockApi, renderAt } from './render';

const people = [{ id: 'p1', firstName: 'Ann', lastName: 'Jumper' }];
const rigs = [
  {
    id: 'r1',
    number: '3',
    name: 'Blue',
    primaryUserId: 'p1',
    components: {
      container: null,
      main: {
        id: 'g4',
        name: 'Storm 150',
        type: 'Main',
        serialNumber: null,
        dateOfManufacture: null,
        imageUrl: null,
      },
      reserve: null,
      aad: null,
    },
  },
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
  { id: 'g2', name: 'Helmet', type: 'Helmet', serialNumber: 'HEL-1', assignedPersonId: 'p1' },
  { id: 'g3', name: 'Hook knife', type: 'Knife', serialNumber: 'KN-9' },
  {
    id: 'g4',
    name: 'Storm 150',
    type: 'Main',
    assignedRigId: 'r1',
    assignedPersonId: 'p1',
    slot: 'main',
  },
];
const lists = {
  'GET /api/rigs': () => ({ status: 200, body: rigs }),
  'GET /api/people': () => ({ status: 200, body: people }),
  'GET /api/gear': () => ({ status: 200, body: gear }),
};

describe('gear list', () => {
  // These check the card layout; the other layouts are covered in inventory.test.tsx.
  beforeEach(() => localStorage.setItem('rigtracker.view.gear', JSON.stringify({ view: 'cards' })));

  it('lists gear with its assignment, and search and filters narrow it', async () => {
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    expect(await screen.findByText('Hook knife')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Rig: #3 · Blue' })).toHaveAttribute(
      'href',
      '/rigs/r1',
    );
    // A component shows its slot with the rig.
    expect(screen.getByRole('link', { name: 'Rig: #3 · Blue · Main' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Person: Ann Jumper' })[0]).toHaveAttribute(
      'href',
      '/people/p1',
    );

    await userEvent.type(screen.getByLabelText('Search gear'), 'kn-9');
    expect(screen.getByText('Hook knife')).toBeInTheDocument();
    expect(screen.queryByText('Helmet', { selector: 'span.truncate' })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Search gear'));

    await userEvent.selectOptions(screen.getByLabelText('Filter by assignment'), 'person');
    expect(screen.getByText('Helmet', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(screen.queryByText('Hook knife')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Filter by assignment'), '');
    await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'Knife');
    expect(screen.getByText('Hook knife')).toBeInTheDocument();
    expect(screen.queryByText('Altimeter', { selector: 'span.truncate' })).not.toBeInTheDocument();
  });

  it('shows viewers no New gear or edit menu', async () => {
    mockApi({ 'GET /api/auth/me': asViewer, ...lists });
    renderAt('/gear');
    expect(await screen.findByText('Hook knife')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New gear/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('shows the error when a save is refused', async () => {
    let body: Record<string, unknown> = {};
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'POST /api/gear': (init) => {
        body = JSON.parse(init!.body as string);
        return { status: 409, body: { message: 'A gear item with serial ALT-1 already exists' } };
      },
    });
    renderAt('/gear');
    await userEvent.click(await screen.findByRole('button', { name: /New gear/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Spare altimeter');
    await userEvent.type(within(dialog).getByLabelText('Type'), 'Altimeter');
    await userEvent.type(within(dialog).getByLabelText('Serial number'), 'ALT-1');
    await userEvent.selectOptions(within(dialog).getByLabelText('Rig'), 'r1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add gear' }));

    expect(
      await within(dialog).findByText('A gear item with serial ALT-1 already exists'),
    ).toBeInTheDocument();
    expect(body).toMatchObject({
      name: 'Spare altimeter',
      type: 'Altimeter',
      serialNumber: 'ALT-1',
      assignedRigId: 'r1',
      assignedPersonId: null,
    });
    // The dialog stays open so the serial can be fixed.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('puts gear in a rig position with the Position select', async () => {
    let body: Record<string, unknown> = {};
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'POST /api/gear': (init) => {
        body = JSON.parse(init!.body as string);
        return { status: 201, body: { id: 'g9' } };
      },
    });
    renderAt('/gear');
    await userEvent.click(await screen.findByRole('button', { name: /New gear/ }));
    const dialog = await screen.findByRole('dialog');
    // Only gear on a rig has a position.
    expect(within(dialog).queryByLabelText('Position')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Smart 150');
    await userEvent.type(within(dialog).getByLabelText('Type'), 'Reserve');
    await userEvent.selectOptions(within(dialog).getByLabelText('Rig'), 'r1');
    const position = within(dialog).getByLabelText('Position');
    expect(
      within(position)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Not a component', 'Container', 'Main (now Storm 150)', 'Reserve', 'AAD']);
    await userEvent.selectOptions(position, 'reserve');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add gear' }));
    await waitFor(() =>
      expect(body).toMatchObject({ name: 'Smart 150', assignedRigId: 'r1', slot: 'reserve' }),
    );
  });

  it('shows the API’s message when the position is taken', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'POST /api/gear': () => ({ status: 409, body: { message: 'Rig #3 already has a main' } }),
    });
    renderAt('/gear');
    await userEvent.click(await screen.findByRole('button', { name: /New gear/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Other main');
    await userEvent.type(within(dialog).getByLabelText('Type'), 'Main');
    await userEvent.selectOptions(within(dialog).getByLabelText('Rig'), 'r1');
    await userEvent.selectOptions(within(dialog).getByLabelText('Position'), 'main');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add gear' }));
    expect(await within(dialog).findByText('Rig #3 already has a main')).toBeInTheDocument();
  });

  it('a gear taken off its rig loses its position', async () => {
    let body: Record<string, unknown> = {};
    mockApi({
      'GET /api/auth/me': asAdmin,
      ...lists,
      'PUT /api/gear/g4': (init) => {
        body = JSON.parse(init!.body as string);
        return { status: 200, body: {} };
      },
    });
    renderAt('/gear');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Storm 150' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Position')).toHaveValue('main');
    await userEvent.selectOptions(within(dialog).getByLabelText('Rig'), '');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(body).toMatchObject({ assignedRigId: null, slot: null }));
  });
});
