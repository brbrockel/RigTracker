import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asAdmin, asViewer, mockApi, renderAt } from './render';

const noEvents = () => ({ status: 200, body: [] });

describe('report a problem', () => {
  it('sends a report from the account menu with the current page', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asViewer,
      'GET /api/events': noEvents,
      'POST /api/bug-reports': () => ({
        status: 201,
        body: { id: 'b1', issueNumber: 7, issueUrl: 'https://github.com/x/y/issues/7' },
      }),
    });
    renderAt('/events');
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    // Viewers report problems too, but only admins see the reports.
    expect(screen.queryByRole('menuitem', { name: /Problem reports/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /Report a problem/ }));
    expect(
      screen.getByText(/public GitHub issue, signed with your first name/),
    ).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('In a few words'), 'Repack date vanishes');
    await userEvent.type(screen.getByLabelText('What happened?'), 'Rig 3 went blank');
    await userEvent.click(send);
    expect(await screen.findByText(/sent as issue #7/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See it on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/x/y/issues/7',
    );
    const post = calls.find((c) => c.key === 'POST /api/bug-reports');
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      title: 'Repack date vanishes',
      happened: 'Rig 3 went blank',
      page: '/events',
    });
  });

  it('lists reports for admins, with who sent them and whether GitHub took them', async () => {
    mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/bug-reports': () => ({
        status: 200,
        body: [
          {
            id: 'b1',
            title: 'Repack date vanishes',
            happened: 'Rig 3 went blank',
            expected: null,
            page: '/rigs/r3',
            appVersion: '2.0.0-rc.2',
            issueNumber: 7,
            issueUrl: 'https://github.com/x/y/issues/7',
            issueError: null,
            createdAt: '2026-10-18T12:00:00.000Z',
            personId: 'p1',
            reporterName: 'Sam Jones',
          },
          {
            id: 'b2',
            title: 'Crash',
            happened: 'It crashed',
            expected: 'No crash',
            page: null,
            appVersion: null,
            issueNumber: null,
            issueUrl: null,
            issueError: 'No GitHub token set; kept in the app only.',
            createdAt: '2026-10-18T11:00:00.000Z',
            personId: null,
            reporterName: null,
          },
        ],
      }),
    });
    renderAt('/problems');
    expect(await screen.findByRole('heading', { name: 'Problem reports' })).toBeInTheDocument();
    const [first, second] = await screen.findAllByRole('listitem');
    expect(within(first!).getByRole('link', { name: 'Sam Jones' })).toHaveAttribute(
      'href',
      '/people/p1',
    );
    expect(within(first!).getByRole('link', { name: /Issue #7/ })).toBeInTheDocument();
    expect(within(second!).getByText(/Not on GitHub: No GitHub token set/)).toBeInTheDocument();
    expect(within(second!).getByText(/Someone \(since deleted\)/)).toBeInTheDocument();
  });
});
