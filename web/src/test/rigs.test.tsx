import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asViewer, mockApi, renderAt } from './render';

const DAY = 86_400_000;
const isoIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10) + 'T00:00:00.000Z';

const people = [
  { _id: 'p1', firstName: 'Ann', lastName: 'Jumper' },
  { _id: 'p2', firstName: 'Bob', lastName: 'Flyer' },
];
const rigs = [
  { _id: 'r1', number: '3', name: 'Blue', primaryUserId: 'p1', repackDue: isoIn(-5), reserveSerialNumber: 'RES-111' },
  { _id: 'r2', number: '4', name: 'Green', primaryUserId: 'p2', repackDue: isoIn(10) },
  { _id: 'r3', name: 'Spare', repackDue: isoIn(120) },
];
const gear = [
  { _id: 'g1', name: 'Altimeter', type: 'Altimeter', serialNumber: 'ALT-1', assignedRigId: 'r1', assignedPersonId: 'p1' },
  { _id: 'g2', name: 'Helmet', type: 'Helmet', serialNumber: 'HEL-1' },
];

const lists = {
  'GET /api/rigs': () => ({ status: 200, body: rigs }),
  'GET /api/people': () => ({ status: 200, body: people }),
  'GET /api/gear': () => ({ status: 200, body: gear }),
};

describe('rigs list', () => {
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
        return { status: 201, body: { _id: 'r9', name: 'Red' } };
      },
    });
    renderAt('/rigs');
    await userEvent.click(await screen.findByRole('button', { name: /New rig/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Red');
    await userEvent.type(within(dialog).getByLabelText('Number'), '7');
    await userEvent.selectOptions(within(dialog).getByLabelText('Primary person'), 'p2');
    fireEvent.change(within(dialog).getByLabelText('Repack due'), { target: { value: '2026-12-01' } });
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
    expect(screen.getByText('RES-111')).toBeInTheDocument();
    expect(await screen.findByText('Altimeter', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(screen.queryByText('Helmet', { selector: 'span.truncate' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assign gear/ })).toBeInTheDocument();
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
