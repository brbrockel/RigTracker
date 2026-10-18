import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '@/lib/api';
import { asAdmin, mockApi, renderAt } from './render';

const entry = (i: number, extra: Partial<AuditEntry> = {}): AuditEntry => ({
  id: `a${i}`,
  action: 'UPDATE',
  resource: 'rigs',
  resourceId: `r${i}`,
  resourceName: `Rig ${i}`,
  userEmail: 'brian@example.com',
  userDisplayName: 'Brian B',
  createdAt: new Date(Date.now() - i * 60_000).toISOString(),
  ...extra,
});

describe('activity log', () => {
  it('describes entries, shows details and loads more', async () => {
    const first = [
      entry(0, { action: 'CREATE', resource: 'gear', resourceName: 'Foo' }),
      entry(1, {
        action: 'SIGN_IN_LINK',
        resource: 'user',
        resourceName: 'sam@example.com',
        userDisplayName: undefined,
        userEmail: undefined,
      }),
      entry(2, {
        action: 'SIGN_IN',
        resource: 'user',
        details: { method: 'link', ip: '10.0.0.1' },
      }),
      ...Array.from({ length: 47 }, (_, i) => entry(i + 3)),
    ];
    const calls = mockApi({
      'GET /api/auth/me': asAdmin,
      'GET /api/audit?page=1&limit=50': () => ({ status: 200, body: { logs: first, total: 51 } }),
      'GET /api/audit?page=2&limit=50': () => ({
        status: 200,
        body: { logs: [entry(60, { resourceName: 'Oldest rig' })], total: 51 },
      }),
      'GET /api/audit?resource=gear&page=1&limit=50': () => ({
        status: 200,
        body: { logs: [first[0]], total: 1 },
      }),
    });
    const user = userEvent.setup();
    renderAt('/activity');

    expect(await screen.findByText('added gear Foo')).toBeInTheDocument();
    expect(screen.getByText('made a sign-in link for sam@example.com')).toBeInTheDocument();
    expect(screen.getByText('Command line')).toBeInTheDocument();

    const signIn = screen.getByRole('button', { name: /signed in/ });
    expect(signIn).toHaveAttribute('aria-expanded', 'false');
    await user.click(signIn);
    expect(screen.getByText(/"ip": "10.0.0.1"/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('changed rig Oldest rig')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'GET /api/audit?page=2&limit=50')).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument(),
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by record type' }),
      'gear',
    );
    await waitFor(() =>
      expect(screen.queryByText('changed rig Oldest rig')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('added gear Foo')).toBeInTheDocument();
  });
});

describe('changed fields', () => {
  it('lists only the fields an update changed', async () => {
    const { changedFields } = await import('@/pages/ActivityPage');
    expect(
      changedFields({
        before: { id: 'r1', name: 'rig-4', notes: null, updatedAt: 'a', repackDue: '2026-06-08' },
        after: { id: 'r1', name: 'rig-4', notes: 'Packed by WSU', updatedAt: 'b', repackDue: null },
      }),
    ).toEqual([
      { field: 'notes', from: '—', to: 'Packed by WSU' },
      { field: 'repackDue', from: '2026-06-08', to: '—' },
    ]);
    expect(changedFields({ before: null, after: null })).toEqual([]);
  });
});
