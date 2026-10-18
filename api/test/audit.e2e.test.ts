import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  as,
  createPerson,
  createTestApp,
  resetDb,
  signInAs,
  type SignedIn,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let admin: SignedIn;
let user: SignedIn;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t);
  admin = await signInAs(t, 'admin');
  user = await signInAs(t, 'user');
});

interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  resourceName: string | null;
  userId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  details: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}
const audit = async (q = '') =>
  (await as(admin).get(`/api/audit${q}`).expect(200)).body as {
    total: number;
    logs: AuditEntry[];
  };

describe('audit log', () => {
  it.each([
    ['rigs', { name: 'Audited rig' }, { name: 'Audited rig 2' }],
    ['gear', { name: 'Audited gear' }, { name: 'Audited gear 2' }],
    ['events', { name: 'Audited event' }, { name: 'Audited event 2' }],
    ['people', { firstName: 'Audited', lastName: 'Person' }, { lastName: 'Person 2' }],
  ])('records who created, updated and deleted %s', async (resource, create, update) => {
    const id = (await as(user).post(`/api/${resource}`, create).expect(201)).body.id;
    await as(user).put(`/api/${resource}/${id}`, update).expect(200);
    await as(admin).delete(`/api/${resource}/${id}`).expect(200);
    const { logs } = await audit(`?resource=${resource}`);
    const mine = logs.filter((l) => l.resourceId === id);
    expect(mine.map((l) => l.action)).toEqual(['DELETE', 'UPDATE', 'CREATE']);
    expect(mine[2]).toMatchObject({ resource, userId: user.id, userEmail: user.email });
    expect(mine[2]!.resourceName).toBeTruthy();
    expect(mine[0]).toMatchObject({ userId: admin.id });
    expect(mine[0]!.createdAt).toBeTruthy();
  });

  it('updates keep the record before and after the change', async () => {
    const rig = (await as(user).post('/api/rigs', { name: 'Before', number: '1' }).expect(201))
      .body;
    await as(user).put(`/api/rigs/${rig.id}`, { name: 'After' }).expect(200);
    const { logs } = await audit('?resource=rigs');
    const [update, create] = logs;
    expect(update).toMatchObject({ action: 'UPDATE', resourceId: rig.id });
    expect(update!.before).toMatchObject({ id: rig.id, name: 'Before', number: '1' });
    expect(update!.after).toMatchObject({ id: rig.id, name: 'After', number: '1' });
    expect(create).toMatchObject({ action: 'CREATE', before: null, after: null });
    // Every entry has the same fields.
    for (const entry of logs)
      expect(Object.keys(entry).sort()).toEqual(
        [
          'action',
          'after',
          'before',
          'createdAt',
          'details',
          'id',
          'resource',
          'resourceId',
          'resourceName',
          'userDisplayName',
          'userEmail',
          'userId',
        ].sort(),
      );

    const p = await createPerson(t, { firstName: 'Pat' });
    await as(admin).patch(`/api/auth/people/${p.id}/access`, { role: 'viewer' }).expect(200);
    await as(user).put(`/api/people/${p.id}`, { phone: '(415) 555-2671' }).expect(200);
    const people = (await audit('?resource=people&action=UPDATE')).logs.filter(
      (l) => l.resourceId === p.id,
    );
    expect(people[0]!.before).toMatchObject({ phone: null, roles: ['viewer'] });
    expect(people[0]!.after).toMatchObject({ phone: '+14155552671' });
    expect(people[1]!.before).toMatchObject({ roles: [] });
    expect(people[1]!.after).toMatchObject({ roles: ['viewer'] });
    for (const entry of people) {
      expect(entry.after).not.toHaveProperty('lastLoginIp');
      expect(entry.after).not.toHaveProperty('lastUserAgent');
    }
  });

  it('records sign-in access changes, links and sign-outs', async () => {
    const p = await createPerson(t);
    await as(admin).patch(`/api/auth/people/${p.id}/access`, { role: 'user' }).expect(200);
    await as(admin).post(`/api/auth/people/${p.id}/link`).expect(201);
    await as(admin).post(`/api/auth/people/${p.id}/sign-out`).expect(201);
    await user.agent.post('/api/auth/logout').expect(201);
    const { logs } = await audit('?resource=people');
    const about = logs.filter((l) => l.resourceId === p.id).map((l) => [l.action, l.details]);
    expect(about).toEqual([
      ['SIGN_OUT', { everywhere: true }],
      ['SIGN_IN_LINK', { email: p.email }],
      ['UPDATE', { signInAccess: 'user' }],
    ]);
    expect(logs.some((l) => l.action === 'SIGN_OUT' && l.resourceId === user.id)).toBe(true);
  });

  it('filters by resource and action and paginates newest first', async () => {
    for (let i = 1; i <= 5; i++)
      await as(user)
        .post('/api/rigs', { name: `Rig ${i}` })
        .expect(201);
    await as(user).post('/api/gear', { name: 'G' }).expect(201);

    const rigs = await audit('?resource=rigs&action=CREATE');
    expect(rigs.total).toBe(5);
    expect(rigs.logs.map((l) => l.resourceName)).toEqual([
      'Rig 5',
      'Rig 4',
      'Rig 3',
      'Rig 2',
      'Rig 1',
    ]);

    const page2 = await audit('?resource=rigs&action=CREATE&page=2&limit=2');
    expect(page2.total).toBe(5);
    expect(page2.logs.map((l) => l.resourceName)).toEqual(['Rig 3', 'Rig 2']);
    expect((await audit('?resource=rigs&page=3&limit=2')).logs).toHaveLength(1);

    expect((await audit('?resource=gear')).total).toBe(1);
    expect((await audit('?action=SIGN_IN')).total).toBe(2);
    expect((await audit('?resource=nothing')).total).toBe(0);
  });

  it('limits pages to 100 entries and tolerates junk paging values', async () => {
    const res = await audit('?limit=1000&page=abc');
    expect(res.logs.length).toBeLessThanOrEqual(100);
    await as(admin).get('/api/audit?limit=-5&page=-1').expect(200);
  });

  it('a non-string filter (?resource[$ne]=x) is ignored, never run as a query operator', async () => {
    await as(user).post('/api/rigs', { name: 'R' }).expect(201);
    const all = await audit();
    const res = await audit('?resource[$ne]=rigs');
    expect(res.total).toBe(all.total);
  });

  it('only admins can read it', async () => {
    await as(user).get('/api/audit').expect(403);
    const viewer = await signInAs(t, 'viewer');
    await as(viewer).get('/api/audit').expect(403);
  });
});
