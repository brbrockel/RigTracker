import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { people } from '../src/db/schema.js';
import {
  MISSING_ID,
  as,
  createPerson,
  createTestApp,
  resetDb,
  signIn,
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

const HIDDEN = ['lastLoginIp', 'lastUserAgent', 'legacyUserId', 'legacyId', 'role'];

describe('people', () => {
  it('create, read, update and delete', async () => {
    const created = (
      await as(user)
        .post('/api/people', {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'Jane.Doe@Example.COM ',
          phone: '(415) 555-2671',
          address: { city: 'Davis', state: 'CA' },
          emergencyContacts: [{ name: 'John', phone: '+14155552672' }],
          customFields: { uspa: 'A-1234' },
        })
        .expect(201)
    ).body;
    expect(created).toMatchObject({
      firstName: 'Jane',
      email: 'jane.doe@example.com',
      phone: '+14155552671',
      address: { city: 'Davis', state: 'CA' },
      customFields: { uspa: 'A-1234' },
      roles: [],
    });
    const list = (await as(user).get('/api/people').expect(200)).body;
    expect(list.map((p: { id: string }) => p.id)).toContain(created.id);
    const updated = (
      await as(user).put(`/api/people/${created.id}`, { lastName: 'Smith' }).expect(200)
    ).body;
    expect(updated).toMatchObject({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.doe@example.com',
    });
    expect((await as(admin).delete(`/api/people/${created.id}`).expect(200)).body).toEqual({
      deleted: true,
    });
    await as(user).get(`/api/people/${created.id}`).expect(404);
    await as(user).put(`/api/people/${created.id}`, { lastName: 'x' }).expect(404);
    await as(admin).delete(`/api/people/${created.id}`).expect(404);
  });

  it.each(['not-an-email', 'a@b', 'x@@example.com'])('rejects the email %s', async (email) => {
    const res = await as(user).post('/api/people', { firstName: 'X', email }).expect(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it.each(['123', 'call me', '+1 000 000 0000'])('rejects the phone number %s', async (phone) => {
    const res = await as(user).post('/api/people', { firstName: 'X', phone }).expect(400);
    expect(res.body.message).toMatch(/phone/i);
  });

  it('normalises phone numbers to E.164, using the country when given', async () => {
    const us = (await as(user).post('/api/people', { phone: '415.555.2671' }).expect(201)).body;
    expect(us.phone).toBe('+14155552671');
    const gb = (
      await as(user).post('/api/people', { phone: '020 7946 0958', country: 'GB' }).expect(201)
    ).body;
    expect(gb.phone).toBe('+442079460958');
    const p = (
      await as(user).put(`/api/people/${us.id}`, { phone: '+1 (415) 555-2672' }).expect(200)
    ).body;
    expect(p.phone).toBe('+14155552672');
  });

  it('a malformed :id is 400, not 500', async () => {
    await as(user).get('/api/people/not-an-id').expect(400);
    await as(user).put('/api/people/not-an-id', { firstName: 'x' }).expect(400);
    await as(admin).delete('/api/people/not-an-id').expect(400);
  });

  it('operator objects are refused, not run as queries', async () => {
    const p = await createPerson(t, { firstName: 'Keep' });
    const res = await as(user).put(`/api/people/${p.id}`, { firstName: { $gt: '' } });
    expect(res.status).toBe(400);
    expect((await as(user).get(`/api/people/${p.id}`)).body.firstName).toBe('Keep');
  });

  it('sign-in fields cannot be set through create or update', async () => {
    const sneaky = {
      roles: ['admin'],
      isActive: false,
      loginCount: 99,
      lastLoginIp: '1.2.3.4',
      legacyUserId: 'x',
      legacyId: 'x',
      role: 'admin',
    };
    const created = (
      await as(user)
        .post('/api/people', { firstName: 'Eve', email: 'eve@example.com', ...sneaky })
        .expect(201)
    ).body;
    expect(created.roles).toEqual([]);
    expect(created.isActive).toBe(true);
    expect(created.loginCount).toBe(0);

    const target = await createPerson(t, { roles: ['viewer'] });
    const updated = (
      await as(user)
        .put(`/api/people/${target.id}`, { firstName: 'Changed', ...sneaky })
        .expect(200)
    ).body;
    expect(updated).toMatchObject({
      firstName: 'Changed',
      roles: ['viewer'],
      isActive: true,
      loginCount: 0,
    });
    const [stored] = await t.db.select().from(people).where(eq(people.firstName, 'Changed'));
    expect(stored).toMatchObject({ role: 'viewer', isActive: true, loginCount: 0 });
    expect(stored!.lastLoginIp).toBeNull();
    expect(stored!.legacyId).toBeNull();
  });

  it('never returns lastLoginIp, lastUserAgent or legacyUserId', async () => {
    const p = await createPerson(t, { roles: ['user'], legacyId: 'old-id' });
    const who = await signIn(t, p.id);
    const [stored] = await t.db.select().from(people).where(eq(people.email, who.email));
    expect(stored).toHaveProperty('lastLoginIp', who.ip);
    expect(stored!.lastUserAgent).toBeTruthy();

    const responses = [
      ...(await as(admin).get('/api/people').expect(200)).body,
      (await as(admin).get(`/api/people/${p.id}`).expect(200)).body,
      (await as(admin).put(`/api/people/${p.id}`, { middleName: 'Q' }).expect(200)).body,
      (await as(admin).patch(`/api/auth/people/${p.id}/access`, { role: 'viewer' }).expect(200))
        .body,
      (await as(who).get('/api/auth/me').expect(200)).body.user,
    ];
    for (const body of responses) for (const key of HIDDEN) expect(body).not.toHaveProperty(key);
  });

  it('someone who signs in keeps an email no one else who signs in uses', async () => {
    const a = await createPerson(t, { roles: ['user'], email: 'a@example.com' });
    const b = await createPerson(t, { roles: ['user'], email: 'b@example.com' });
    await as(user).put(`/api/people/${b.id}`, { email: 'A@example.com' }).expect(409);
    await as(user).put(`/api/people/${a.id}`, { email: '' }).expect(400);
    // People who don't sign in can share an email.
    const c = await createPerson(t, { email: 'c@example.com' });
    await as(user).put(`/api/people/${c.id}`, { email: 'a@example.com' }).expect(200);
    await as(user).put(`/api/people/${MISSING_ID}`, { email: 'z@example.com' }).expect(404);
  });

  it('an admin cannot delete themselves', async () => {
    const res = await as(admin).delete(`/api/people/${admin.id}`).expect(403);
    expect(res.body.message).toMatch(/yourself/);
    await as(admin).get('/api/rigs').expect(200);
  });
});
