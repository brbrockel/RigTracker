import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MISSING_ID,
  anon,
  as,
  createPerson,
  createTestApp,
  nextIp,
  resetDb,
  signInAs,
  type Role,
  type SignedIn,
  type TestApp,
} from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
/** read: anyone signed in; write: user or admin; admin: admins only. */
type Need = 'read' | 'write' | 'admin';
const id = MISSING_ID;
const ROUTES: Array<[Method, string, Need]> = [
  ['get', '/api/rigs', 'read'],
  ['get', `/api/rigs/${id}`, 'read'],
  ['post', '/api/rigs', 'write'],
  ['put', `/api/rigs/${id}`, 'write'],
  ['delete', `/api/rigs/${id}`, 'admin'],
  ['get', '/api/gear', 'read'],
  ['get', `/api/gear/${id}`, 'read'],
  ['post', '/api/gear', 'write'],
  ['put', `/api/gear/${id}`, 'write'],
  ['delete', `/api/gear/${id}`, 'admin'],
  ['get', '/api/people', 'read'],
  ['get', `/api/people/${id}`, 'read'],
  ['post', '/api/people', 'write'],
  ['put', `/api/people/${id}`, 'write'],
  ['delete', `/api/people/${id}`, 'admin'],
  ['get', '/api/events', 'read'],
  ['get', `/api/events/${id}`, 'read'],
  ['post', '/api/events', 'write'],
  ['put', `/api/events/${id}`, 'write'],
  ['delete', `/api/events/${id}`, 'admin'],
  ['get', '/api/audit', 'admin'],
  ['patch', `/api/auth/people/${id}/access`, 'admin'],
  ['post', `/api/auth/people/${id}/link`, 'admin'],
  ['post', `/api/auth/people/${id}/sign-out`, 'admin'],
  ['get', `/api/media?ownerType=rig&ownerId=${id}`, 'read'],
  ['post', '/api/media', 'write'],
  ['patch', `/api/media/${id}`, 'write'],
  ['delete', `/api/media/${id}`, 'write'],
];

const ALLOWED: Record<Role, Need[]> = {
  viewer: ['read'],
  user: ['read', 'write'],
  admin: ['read', 'write', 'admin'],
};

describe('signed out', () => {
  it.each(ROUTES)('%s %s → 401', async (method, url) => {
    const res = await anon(t)[method](url);
    expect(res.status).toBe(401);
  });

  it('GET /uploads/<file> → 401', async () => {
    fs.writeFileSync(path.join(process.env.UPLOADS_DIR!, 'signed-out.jpg'), 'x');
    await anon(t).get('/uploads/signed-out.jpg').expect(401);
  });

  it('a made-up session cookie is rejected', async () => {
    await request(t.app.getHttpServer())
      .get('/api/rigs')
      .set('CF-Connecting-IP', nextIp())
      .set('Cookie', 'rigtracker_session=not-a-real-session')
      .expect(401);
  });

  it('GET /api/auth/me says not signed in', async () => {
    const res = await anon(t).get('/api/auth/me').expect(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it('public sign-in routes answer without a session', async () => {
    await anon(t)
      .post('/api/auth/link/check', { token: 'x'.repeat(43) })
      .expect(404);
    await anon(t)
      .post('/api/auth/link/redeem', { token: 'x'.repeat(43) })
      .expect(401);
    await anon(t).post('/api/auth/logout').expect(201, { ok: true });
  });
});

describe.each(['viewer', 'user', 'admin'] as Role[])('as %s', (role) => {
  let who: SignedIn;
  beforeEach(async () => {
    who = await signInAs(t, role);
  });

  it.each(ROUTES)('%s %s is allowed only for the right roles', async (method, url, need) => {
    // Admin routes about "someone" target a real other person so a 403 can't come from self-checks.
    const res = await as(who)[method](url);
    if (ALLOWED[role].includes(need)) {
      expect(res.status, `${method} ${url}: ${JSON.stringify(res.body)}`).not.toBe(401);
      expect(res.status).not.toBe(403);
    } else {
      expect(res.status).toBe(403);
    }
  });

  it('can view uploaded files', async () => {
    fs.writeFileSync(path.join(process.env.UPLOADS_DIR!, `as-${role}.jpg`), 'x');
    await as(who).get(`/uploads/as-${role}.jpg`).expect(200);
  });
});

describe('what each role can actually do', () => {
  it('a viewer can read records but not change them', async () => {
    const admin = await signInAs(t, 'admin');
    const viewer = await signInAs(t, 'viewer');
    const rig = (await as(admin).post('/api/rigs', { name: 'R1' }).expect(201)).body;
    expect(
      (await as(viewer).get('/api/rigs').expect(200)).body.map((r: { name: string }) => r.name),
    ).toEqual(['R1']);
    await as(viewer).get(`/api/rigs/${rig.id}`).expect(200);
    await as(viewer).post('/api/rigs', { name: 'R2' }).expect(403);
    await as(viewer).put(`/api/rigs/${rig.id}`, { name: 'R3' }).expect(403);
    await as(viewer).delete(`/api/rigs/${rig.id}`).expect(403);
    expect((await as(viewer).get(`/api/rigs/${rig.id}`)).body.name).toBe('R1');
  });

  it('a user can create and update but not delete', async () => {
    const user = await signInAs(t, 'user');
    const gear = (await as(user).post('/api/gear', { name: 'Altimeter' }).expect(201)).body;
    await as(user).put(`/api/gear/${gear.id}`, { name: 'Altimeter 2' }).expect(200);
    await as(user).delete(`/api/gear/${gear.id}`).expect(403);
    const person = await createPerson(t);
    await as(user).delete(`/api/people/${person.id}`).expect(403);
    await as(user).patch(`/api/auth/people/${person.id}/access`, { role: 'admin' }).expect(403);
    await as(user).get('/api/audit').expect(403);
  });

  it('an admin can delete records and manage access', async () => {
    const admin = await signInAs(t, 'admin');
    const person = await createPerson(t);
    await as(admin).patch(`/api/auth/people/${person.id}/access`, { role: 'user' }).expect(200);
    await as(admin).post(`/api/auth/people/${person.id}/link`).expect(201);
    await as(admin).post(`/api/auth/people/${person.id}/sign-out`).expect(201);
    const ev = (await as(admin).post('/api/events', { name: 'Boogie' }).expect(201)).body;
    await as(admin).delete(`/api/events/${ev.id}`).expect(200);
    await as(admin).delete(`/api/people/${person.id}`).expect(200);
    await as(admin).get('/api/audit').expect(200);
  });
});

describe('CSRF and cross-site protection', () => {
  let user: SignedIn;
  beforeEach(async () => {
    user = await signInAs(t, 'user');
  });

  it('a change without x-csrf-token is refused', async () => {
    const res = await user.agent.post('/api/rigs').send({ name: 'No token' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/CSRF/);
  });

  it('a change with the wrong token is refused', async () => {
    await user.agent.post('/api/rigs').set('x-csrf-token', 'wrong').send({ name: 'x' }).expect(403);
    const sameLength = user.csrf.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
    await user.agent
      .post('/api/rigs')
      .set('x-csrf-token', sameLength)
      .send({ name: 'x' })
      .expect(403);
    await user.agent.delete(`/api/rigs/${MISSING_ID}`).set('x-csrf-token', 'wrong').expect(403);
    expect((await as(user).get('/api/rigs')).body).toEqual([]);
  });

  it('a change with the right token works', async () => {
    await user.agent
      .post('/api/rigs')
      .set('x-csrf-token', user.csrf)
      .send({ name: 'ok' })
      .expect(201);
  });

  it('/api/auth/me returns the same CSRF token as sign-in', async () => {
    const me = await as(user).get('/api/auth/me').expect(200);
    expect(me.body.csrfToken).toBe(user.csrf);
    expect(me.body.authenticated).toBe(true);
  });

  it('a change from another site is refused even with a valid session and token', async () => {
    const res = await user.agent
      .post('/api/rigs')
      .set('Host', 'rigs.example')
      .set('Origin', 'https://evil.example')
      .set('x-csrf-token', user.csrf)
      .send({ name: 'evil' });
    expect(res.status).toBe(403);
    expect((await as(user).get('/api/rigs')).body).toEqual([]);
  });

  it('a change whose Origin is this site is allowed', async () => {
    await user.agent
      .post('/api/rigs')
      .set('Host', 'rigs.example')
      .set('Origin', 'https://rigs.example')
      .set('x-csrf-token', user.csrf)
      .send({ name: 'same site' })
      .expect(201);
  });

  it('a cross-site request to a public route (logout) is refused too', async () => {
    await user.agent
      .post('/api/auth/logout')
      .set('Host', 'rigs.example')
      .set('Origin', 'https://evil.example')
      .expect(403);
    await as(user).get('/api/rigs').expect(200);
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const res = await anon(t).get('/api/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
