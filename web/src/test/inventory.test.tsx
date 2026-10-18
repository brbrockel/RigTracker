import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildCsv, csvCell, csvDate, csvFilename } from '@/components/inventory/csv';
import { asUser, asViewer, mockApi, renderAt } from './render';

const people = [{ _id: 'p1', firstName: 'Ann', lastName: 'Jumper' }];
const rigs = [{ _id: 'r1', number: '3', name: 'Blue', primaryUserId: 'p1' }];
const gear = [
  {
    _id: 'g1',
    name: 'Altimeter',
    type: 'Altimeter',
    serialNumber: 'ALT-1',
    assignedRigId: 'r1',
    assignedPersonId: 'p1',
  },
  {
    _id: 'g2',
    name: 'Helmet',
    type: 'Helmet',
    serialNumber: 'HEL-1',
    assignedPersonId: 'p1',
    dateOfManufacture: '2024-05-06T00:00:00.000Z',
  },
  { _id: 'g3', name: 'Hook knife', type: 'Knife', serialNumber: 'KN-9' },
  {
    _id: 'g4',
    name: 'Spare helmet',
    type: 'Helmet',
    serialNumber: 'HEL-10',
    notes: '=cmd, "quoted"',
  },
];
const lists = {
  'GET /api/rigs': () => ({ status: 200, body: rigs }),
  'GET /api/people': () => ({ status: 200, body: people }),
  'GET /api/gear': () => ({ status: 200, body: gear }),
};

const KEY = 'rigtracker.view.gear';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');
const useView = (view: string, extra: Record<string, unknown> = {}) =>
  localStorage.setItem(KEY, JSON.stringify({ view, ...extra }));

/** The table's data rows (header and group rows left out), as their text. */
function tableRows() {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .filter((r) => within(r).queryAllByRole('cell').length > 0)
    .map((r) => r.textContent ?? '');
}

describe('inventory layouts', () => {
  it('remembers the chosen layout on this device', async () => {
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    expect(await screen.findByText('Hook knife')).toBeInTheDocument();
    // No stored choice and a phone-sized screen: List.
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Gallery view' }));
    expect(screen.getByRole('button', { name: 'Gallery view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(stored()).toMatchObject({ view: 'gallery' });

    cleanup();
    renderAt('/gear');
    expect(await screen.findByText('Hook knife')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('starts in Table on a wide screen and ignores a broken stored value', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query === '(min-width: 768px)', media: query }) as MediaQueryList,
    );
    localStorage.setItem(KEY, '{not json');
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Table view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('columnheader', { name: /Serial/ })).toBeInTheDocument();
  });

  it('sorts the table by a column header, toggling the order', async () => {
    useView('table');
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    await screen.findByRole('table');
    await waitFor(() => expect(tableRows()[0]).toContain('Altimeter'));

    const serial = () => screen.getByRole('columnheader', { name: /Serial/ });
    await userEvent.click(within(serial()).getByRole('button'));
    expect(serial()).toHaveAttribute('aria-sort', 'ascending');
    // Natural order: HEL-1 before HEL-10.
    expect(tableRows().map((r) => r.match(/[A-Z]+-\d+/)?.[0])).toEqual([
      'ALT-1',
      'HEL-1',
      'HEL-10',
      'KN-9',
    ]);

    await userEvent.click(within(serial()).getByRole('button'));
    expect(serial()).toHaveAttribute('aria-sort', 'descending');
    expect(tableRows()[0]).toContain('Hook knife');
    expect(stored()).toMatchObject({ sort: { by: 'serial', dir: 'desc' } });
  });

  it('hides a column picked off in the Columns menu', async () => {
    useView('table');
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    await screen.findByRole('table');
    expect(screen.getByRole('columnheader', { name: /Serial/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Notes/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Columns/ }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Serial' }));
    expect(screen.queryByRole('columnheader', { name: /Serial/ })).not.toBeInTheDocument();
    expect(screen.queryByText('KN-9')).not.toBeInTheDocument();
    expect(stored().columns).not.toContain('serial');
  });

  it('groups by type with a heading and count per group', async () => {
    useView('list');
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    await screen.findByText('Hook knife');
    await userEvent.selectOptions(screen.getByLabelText('Group by'), 'type');
    expect(screen.getByRole('heading', { name: 'Helmet 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Altimeter 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Knife 1' })).toBeInTheDocument();
    const helmets = screen.getByRole('heading', { name: 'Helmet 2' }).closest('section')!;
    expect(within(helmets).getByText('Spare helmet')).toBeInTheDocument();
    expect(within(helmets).queryByText('Hook knife')).not.toBeInTheDocument();
  });
});

describe('bulk actions', () => {
  it('assigns two selected items to a rig, one PUT each with the CSRF token', async () => {
    useView('list');
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      ...lists,
      'PUT /api/gear/g2': () => ({ status: 200, body: {} }),
      'PUT /api/gear/g3': () => ({ status: 200, body: {} }),
    });
    renderAt('/gear');
    await screen.findByText('Hook knife');
    await userEvent.click(screen.getByRole('button', { name: /^Select$/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Helmet' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Hook knife' }));
    const bar = screen.getByRole('region', { name: 'Selected items' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();

    await userEvent.click(within(bar).getByRole('button', { name: /Assign to rig/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Rig'), 'r1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign 2 items' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const puts = calls.filter((c) => c.key.startsWith('PUT'));
    expect(puts.map((c) => c.key)).toEqual(['PUT /api/gear/g2', 'PUT /api/gear/g3']);
    for (const put of puts) {
      expect(JSON.parse(put.init!.body as string)).toEqual({ assignedRigId: 'r1' });
      expect((put.init!.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    }
    // The selection is cleared afterwards.
    expect(screen.queryByRole('region', { name: 'Selected items' })).not.toBeInTheDocument();
  });

  it('stops at the first failure and says what was already changed', async () => {
    useView('list');
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      ...lists,
      'PUT /api/gear/g1': () => ({ status: 200, body: {} }),
      'PUT /api/gear/g2': () => ({ status: 400, body: { message: 'Assigned person not found' } }),
      'PUT /api/gear/g3': () => ({ status: 200, body: {} }),
    });
    renderAt('/gear');
    await screen.findByText('Hook knife');
    await userEvent.click(screen.getByRole('button', { name: /^Select$/ }));
    for (const name of ['Altimeter', 'Helmet', 'Hook knife'])
      await userEvent.click(screen.getByRole('checkbox', { name: `Select ${name}` }));
    await userEvent.click(screen.getByRole('button', { name: /Assign to person/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Person'), 'p1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign 3 items' }));

    expect(
      await within(dialog).findByText(
        'Stopped at Helmet: Assigned person not found Updated 1 of 3 before stopping: Altimeter.',
      ),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.key.startsWith('PUT')).map((c) => c.key)).toEqual([
      'PUT /api/gear/g1',
      'PUT /api/gear/g2',
    ]);
    const body = JSON.parse(calls.find((c) => c.key === 'PUT /api/gear/g1')!.init!.body as string);
    expect(body).toEqual({ assignedRigId: null, assignedPersonId: 'p1' });
    // A retry carries on with the two that are left.
    expect(within(dialog).getByRole('button', { name: 'Assign 2 items' })).toBeInTheDocument();
  });

  it('gives viewers no change actions but lets them export the selection', async () => {
    useView('table');
    mockApi({ 'GET /api/auth/me': asViewer, ...lists });
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:csv';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderAt('/gear');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /^Select$/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Spare helmet' }));
    const bar = screen.getByRole('region', { name: 'Selected items' });
    expect(within(bar).queryByRole('button', { name: /Assign/ })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: /Unassign/ })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();

    await userEvent.click(within(bar).getByRole('button', { name: /Export CSV/ }));
    expect(click).toHaveBeenCalled();
    const text = await blob!.text();
    expect(text.split('\r\n')).toEqual([
      'Photo,Name,Type,Serial,Made,Rig,Person',
      ',Spare helmet,Helmet,HEL-10,,,',
      '',
    ]);
  });

  it('selects every shown row from the table header', async () => {
    useView('table');
    mockApi({ 'GET /api/auth/me': asUser, ...lists });
    renderAt('/gear');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /^Select$/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Helmet' }));
    const all = screen.getByRole('checkbox', { name: 'Select all shown' }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await userEvent.click(all);
    expect(screen.getByText('4 selected')).toBeInTheDocument();
  });
});

describe('CSV', () => {
  it('quotes, guards formulas, adds a BOM and writes dates as yyyy-mm-dd', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('=x, "y"')).toBe(`"'=x, ""y"""`);

    const text = buildCsv(['Name', 'Notes'], [['Helmet', 'a,b']]);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toBe('﻿Name,Notes\r\nHelmet,"a,b"\r\n');

    expect(csvDate('2026-03-04T00:00:00.000Z')).toBe('2026-03-04');
    expect(csvDate('1899-12-30T00:00:00.000Z')).toBe('');
    expect(csvDate(undefined)).toBe('');
    expect(csvFilename('gear', new Date(2026, 9, 17))).toBe('rigtracker-gear-2026-10-17.csv');
  });
});

describe('rigs layouts', () => {
  const DAY = 86_400_000;
  const isoIn = (days: number) =>
    new Date(Date.now() + days * DAY).toISOString().slice(0, 10) + 'T00:00:00.000Z';
  const rigList = [
    {
      _id: 'r1',
      number: '10',
      name: 'Blue',
      primaryUserId: 'p1',
      repackDue: isoIn(-5),
      container: 'Javelin',
      containerSerialNumber: 'J-1',
    },
    { _id: 'r2', number: '2', name: 'Green', repackDue: isoIn(10) },
    { _id: 'r3', name: 'Spare' },
  ];
  const rigApi = { ...lists, 'GET /api/rigs': () => ({ status: 200, body: rigList }) };

  it('shows a table with rig links in natural number order, and groups by repack status', async () => {
    localStorage.setItem('rigtracker.view.rigs', JSON.stringify({ view: 'table' }));
    mockApi({ 'GET /api/auth/me': asUser, ...rigApi });
    renderAt('/rigs');
    expect(await screen.findByRole('link', { name: '#10 · Blue' })).toHaveAttribute(
      'href',
      '/rigs/r1',
    );
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('link')
        .filter((a) => a.getAttribute('href')?.startsWith('/rigs/'))
        .map((a) => a.textContent),
    ).toEqual(['#2 · Green', '#10 · Blue', 'Spare']);
    expect(screen.getByText('S/N J-1')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Group by'), 'repack');
    const groupRows = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .filter((th) => th.getAttribute('scope') === 'colgroup')
      .map((th) => th.textContent);
    expect(groupRows).toEqual(['Overdue (1)', 'Due in 30 days (1)', 'No date (1)']);
  });
});
