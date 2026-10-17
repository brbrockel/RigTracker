import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asUser, asViewer, mockApi, renderAt } from './render';

const people = [{ _id: 'p1', firstName: 'Ann', lastName: 'Jumper' }];
const rigs = [{ _id: 'r1', number: '3', name: 'Blue', primaryUserId: 'p1' }];
const gear = [
  { _id: 'g1', name: 'Altimeter', type: 'Altimeter', serialNumber: 'ALT-1', assignedRigId: 'r1', assignedPersonId: 'p1' },
  { _id: 'g2', name: 'Helmet', type: 'Helmet', serialNumber: 'HEL-1', assignedPersonId: 'p1' },
  { _id: 'g3', name: 'Hook knife', type: 'Knife', serialNumber: 'KN-9' },
];
const lists = {
  'GET /api/rigs': () => ({ status: 200, body: rigs }),
  'GET /api/people': () => ({ status: 200, body: people }),
  'GET /api/gear': () => ({ status: 200, body: gear }),
};

describe('gear list', () => {
  it('lists gear with its assignment, and search and filters narrow it', async () => {
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    expect(await screen.findByText('Hook knife')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Rig: #3 · Blue' })).toHaveAttribute('href', '/rigs/r1');
    expect(screen.getAllByRole('link', { name: 'Person: Ann Jumper' })[0]).toHaveAttribute('href', '/people/p1');

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

    expect(await within(dialog).findByText('A gear item with serial ALT-1 already exists')).toBeInTheDocument();
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
});
