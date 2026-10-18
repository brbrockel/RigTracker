import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/tokens.js';
import { people, sessions, signInLinks } from '../src/db/schema.js';
import {
  MISSING_ID,
  SESSION_COOKIE,
  anon,
  as,
  createLinkToken,
  createPerson,
  createTestApp,
  nextIp,
  resetDb,
  signIn,
  signInAs,
  type TestApp,
} from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

const HASH = /^[a-f0-9]{64}$/;

describe('sign-in links', () => {
  it('checking a link says who it is for and does not use it up', async () => {
    const p = await createPerson(t, { firstName: 'Ada', lastName: 'Lovelace', roles: ['user'] });
    const token = await createLinkToken(t, p.id);
    const first = await anon(t).post('/api/auth/link/check', { token });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ email: p.email, displayName: 'Ada Lovelace' });
    await anon(t).post('/api/auth/link/check', { token }).expect(201);
    await anon(t).post('/api/auth/link/redeem', { token }).expect(201);
  });

  it('redeeming signs in once; the same link then fails', async () => {
    const p = await createPerson(t, { roles: ['viewer'] });
    const token = await createLinkToken(t, p.id);
    const agent = request.agent(t.app.getHttpServer()).set('CF-Connecting-IP', nextIp());
    const res = await agent.post('/api/auth/link/redeem').send({ token }).expect(201);
    expect(res.body).toMatchObject({
      authenticated: true,
      user: { id: p.id, email: p.email, roles: ['viewer'] },
    });
    expect(res.body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      authenticated: true,
      user: { id: p.id },
      csrfToken: res.body.csrfToken,
    });

    await anon(t).post('/api/auth/link/redeem', { token }).expect(401);
    await anon(t).post('/api/auth/link/check', { token }).expect(404);
  });

  it('an expired link is 404 on check and 401 on redeem', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    const token = await createLinkToken(t, p.id, new Date(Date.now() - 1000));
    await anon(t).post('/api/auth/link/check', { token }).expect(404);
    await anon(t).post('/api/auth/link/redeem', { token }).expect(401);
  });

  it('an unknown well-formed token is 404 on check and 401 on redeem', async () => {
    await anon(t)
      .post('/api/auth/link/check', { token: 'a'.repeat(43) })
      .expect(404);
    await anon(t)
      .post('/api/auth/link/redeem', { token: 'a'.repeat(43) })
      .expect(401);
  });

  it.each([
    ['too short', { token: 'abc' }],
    ['bad characters', { token: '!'.repeat(43) }],
    ['an object', { token: { $gt: '' } }],
    ['missing', {}],
  ])('a malformed token (%s) is 400', async (_name, body) => {
    await anon(t).post('/api/auth/link/check', body).expect(400);
    await anon(t).post('/api/auth/link/redeem', body).expect(400);
  });

  it('a person without sign-in access cannot use a link', async () => {
    const p = await createPerson(t, { roles: [] });
    const token = await createLinkToken(t, p.id);
    await anon(t).post('/api/auth/link/check', { token }).expect(404);
    await anon(t).post('/api/auth/link/redeem', { token }).expect(401);
  });

  it('a person with sign-in disabled (isActive: false) cannot use a link', async () => {
    const p = await createPerson(t, { roles: ['admin'], isActive: false });
    const token = await createLinkToken(t, p.id);
    await anon(t).post('/api/auth/link/check', { token }).expect(404);
    await anon(t).post('/api/auth/link/redeem', { token }).expect(401);
  });

  it('a person without an email cannot use a link', async () => {
    const p = await createPerson(t, { roles: ['user'], email: undefined });
    const token = await createLinkToken(t, p.id);
    await anon(t).post('/api/auth/link/redeem', { token }).expect(401);
  });

  it('disabling a signed-in person ends their access', async () => {
    const user = await signInAs(t, 'user');
    await t.db.update(people).set({ isActive: false }).where(eq(people.id, user.id));
    await as(user).get('/api/rigs').expect(401);
  });

  it('the session cookie is HttpOnly and SameSite=Lax', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    const token = await createLinkToken(t, p.id);
    const res = await anon(t).post('/api/auth/link/redeem', { token }).expect(201);
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
  });

  it('stores only 64-character hashes of link and session tokens', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    const token = await createLinkToken(t, p.id);
    const who = await signIn(t, p.id);
    const links = await t.db.select().from(signInLinks);
    for (const link of links) {
      expect(link.tokenHash).toMatch(HASH);
      expect(JSON.stringify(link)).not.toContain(token);
    }
    const stored = await t.db.select().from(sessions);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).toMatch(HASH);
    expect(stored[0]!.tokenHash).toBe(hashToken(who.sessionToken));
    expect(JSON.stringify(stored[0])).not.toContain(who.sessionToken);
  });

  it('a link made by an admin stores only its hash and puts the token in the URL fragment', async () => {
    const admin = await signInAs(t, 'admin');
    const p = await createPerson(t, { roles: ['user'] });
    const res = await as(admin).post(`/api/auth/people/${p.id}/link`).expect(201);
    expect(res.body.email).toBe(p.email);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 71 * 3600_000);
    const token = res.body.link.match(/\/sign-in#token=([A-Za-z0-9_-]{43})$/)?.[1];
    expect(token).toBeTruthy();
    const [row] = await t.db.select().from(signInLinks).where(eq(signInLinks.personId, p.id));
    expect(row!.tokenHash).toBe(hashToken(token));
    expect(row!.createdByEmail).toBe(admin.email);
    await anon(t).post('/api/auth/link/redeem', { token }).expect(201);
  });

  it('logout ends the session and clears the cookie', async () => {
    const user = await signInAs(t, 'user');
    const res = await user.agent.post('/api/auth/logout').expect(201);
    expect(res.body).toEqual({ ok: true });
    expect(String(res.headers['set-cookie'])).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    // Even replaying the old cookie no longer works.
    await request(t.app.getHttpServer())
      .get('/api/rigs')
      .set('CF-Connecting-IP', nextIp())
      .set('Cookie', `${SESSION_COOKIE}=${user.sessionToken}`)
      .expect(401);
    expect((await user.agent.get('/api/auth/me')).body).toEqual({ authenticated: false });
  });

  it('signing in writes a SIGN_IN audit entry and updates the login count', async () => {
    const user = await signInAs(t, 'user');
    const admin = await signInAs(t, 'admin');
    const res = await as(admin).get('/api/audit?action=SIGN_IN').expect(200);
    const entry = res.body.logs.find((l: { resourceId: string }) => l.resourceId === user.id);
    expect(entry).toMatchObject({
      action: 'SIGN_IN',
      resource: 'people',
      userId: user.id,
      userEmail: user.email,
    });
    const person = (await as(admin).get(`/api/people/${user.id}`)).body;
    expect(person.loginCount).toBe(1);
    expect(person.lastLoginAt).toBeTruthy();
  });

  it('rate-limits sign-in link checks: the 11th from one IP within a minute is 429', async () => {
    const ip = nextIp();
    const check = () =>
      request(t.app.getHttpServer())
        .post('/api/auth/link/check')
        .set('CF-Connecting-IP', ip)
        .send({ token: 'b'.repeat(43) });
    for (let i = 0; i < 10; i++) expect((await check()).status).toBe(404);
    expect((await check()).status).toBe(429);
    // Another visitor is not affected.
    await anon(t)
      .post('/api/auth/link/check', { token: 'b'.repeat(43) })
      .expect(404);
  });
});

describe('sign-in access management (admins)', () => {
  it('gives a person a role so they can sign in', async () => {
    const admin = await signInAs(t, 'admin');
    const p = await createPerson(t);
    const res = await as(admin)
      .patch(`/api/auth/people/${p.id}/access`, { role: 'viewer' })
      .expect(200);
    expect(res.body.roles).toEqual(['viewer']);
    const who = await signIn(t, p.id);
    expect((await as(who).get('/api/auth/me')).body.user.roles).toEqual(['viewer']);
  });

  it.each([['superuser'], [''], [undefined], [['admin']]])(
    'rejects an unknown role %j',
    async (role) => {
      const admin = await signInAs(t, 'admin');
      const p = await createPerson(t);
      await as(admin).patch(`/api/auth/people/${p.id}/access`, { role }).expect(400);
    },
  );

  it('needs the person to have an email address', async () => {
    const admin = await signInAs(t, 'admin');
    const p = await createPerson(t, { email: undefined });
    const res = await as(admin)
      .patch(`/api/auth/people/${p.id}/access`, { role: 'user' })
      .expect(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('refuses an email another person who signs in already uses', async () => {
    const admin = await signInAs(t, 'admin');
    await createPerson(t, { email: 'shared@example.com', roles: ['user'] });
    const p = await createPerson(t, { email: 'shared@example.com' });
    await as(admin).patch(`/api/auth/people/${p.id}/access`, { role: 'user' }).expect(409);
  });

  it('an admin cannot remove their own admin role', async () => {
    const admin = await signInAs(t, 'admin');
    await as(admin).patch(`/api/auth/people/${admin.id}/access`, { role: 'user' }).expect(403);
    await as(admin).patch(`/api/auth/people/${admin.id}/access`, { role: null }).expect(403);
    await as(admin).get('/api/audit').expect(200);
  });

  it('role null removes access and ends that person’s sessions', async () => {
    const admin = await signInAs(t, 'admin');
    const user = await signInAs(t, 'user');
    await as(user).get('/api/rigs').expect(200);
    const res = await as(admin)
      .patch(`/api/auth/people/${user.id}/access`, { role: null })
      .expect(200);
    expect(res.body.roles).toEqual([]);
    await as(user).get('/api/rigs').expect(401);
    // Giving access back doesn't revive the old session.
    await as(admin).patch(`/api/auth/people/${user.id}/access`, { role: 'user' }).expect(200);
    await as(user).get('/api/rigs').expect(401);
  });

  it('an unknown person is 404; a malformed id is 400', async () => {
    const admin = await signInAs(t, 'admin');
    await as(admin).patch(`/api/auth/people/${MISSING_ID}/access`, { role: 'user' }).expect(404);
    await as(admin).patch('/api/auth/people/not-an-id/access', { role: 'user' }).expect(400);
    await as(admin).post('/api/auth/people/not-an-id/link').expect(400);
    await as(admin).post('/api/auth/people/not-an-id/sign-out').expect(400);
  });

  it('a sign-in link needs the person to have access', async () => {
    const admin = await signInAs(t, 'admin');
    const p = await createPerson(t);
    await as(admin).post(`/api/auth/people/${p.id}/link`).expect(400);
    await as(admin).post(`/api/auth/people/${MISSING_ID}/link`).expect(404);
  });

  it('sign-out everywhere ends all of a person’s sessions', async () => {
    const admin = await signInAs(t, 'admin');
    const p = await createPerson(t, { roles: ['user'] });
    const phone = await signIn(t, p.id);
    const laptop = await signIn(t, p.id);
    await as(admin).post(`/api/auth/people/${p.id}/sign-out`).expect(201, { ok: true });
    await as(phone).get('/api/rigs').expect(401);
    await as(laptop).get('/api/rigs').expect(401);
    await as(admin).get('/api/rigs').expect(200);
    // They can still sign in again with a new link.
    const again = await signIn(t, p.id);
    await as(again).get('/api/rigs').expect(200);
  });
});
