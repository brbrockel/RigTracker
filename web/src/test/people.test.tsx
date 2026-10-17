import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asViewer, mockApi, renderAt } from './render';

const people = [
  { _id: 'p1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+18605551234' },
  { _id: 'p2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.mil' },
];

describe('people', () => {
  it('lists people with contact links and filters by search', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/people': () => ({ status: 200, body: people }),
    });
    renderAt('/people');
    expect(await screen.findByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/people/p1');
    expect(screen.getByRole('link', { name: 'Grace Hopper' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call (860) 555-1234' })).toHaveAttribute('href', 'tel:+18605551234');
    expect(screen.getByRole('link', { name: 'Text (860) 555-1234' })).toHaveAttribute('href', 'sms:+18605551234');
    expect(screen.getByRole('link', { name: /grace@navy.mil/ })).toHaveAttribute('href', 'mailto:grace@navy.mil');

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
    expect(screen.getByRole('link', { name: 'Call Bob' })).toHaveAttribute('href', 'tel:+12035550000');
    expect(await screen.findByRole('link', { name: /#7 · Javelin/ })).toHaveAttribute('href', '/rigs/r1');
    expect(screen.queryByText(/Other/)).not.toBeInTheDocument();
    expect(await screen.findByText('Altimeter')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Assign gear/ }));
    await userEvent.selectOptions(await screen.findByLabelText('Gear'), 'g2');
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'PUT /api/gear/g2')).toBe(true));
    const put = calls.find((c) => c.key === 'PUT /api/gear/g2')!;
    expect(JSON.parse(String(put.init?.body))).toEqual({ assignedRigId: null, assignedPersonId: 'p1' });
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
});
