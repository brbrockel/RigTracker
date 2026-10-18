import * as fs from 'node:fs';
import * as path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, media, sessions } from '../src/db/schema.js';
import {
  anon,
  as,
  createPerson,
  createTestApp,
  resetDb,
  sessionCookie,
  signInAs,
  signInGuest,
  type SignedIn,
  type TestApp,
} from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

describe('a guest session', () => {
  it('is a session without a person, with a CSRF token, for 12 hours', async () => {
    const res = await anon(t).post('/api/auth/guest').expect(201);
    expect(res.body).toMatchObject({
      authenticated: true,
      user: { id: 'guest', displayName: 'Guest', roles: [], isGuest: true },
      csrfToken: expect.stringMatching(/^[\w-]{43}$/),
    });
    expect(res.body.user).not.toHaveProperty('email');
    expect(sessionCookie(res)).toBeTruthy();
    const [row] = await t.db.select().from(sessions);
    expect(row).toMatchObject({ isGuest: true, personId: null });
    const hours = (row!.expiresAt.getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'GUEST_SIGN_IN'));
    expect(entry).toMatchObject({ resource: 'guests', userId: null });
  });

  it('/api/auth/me answers as the guest', async () => {
    const guest = await signInGuest(t);
    const me = await as(guest).get('/api/auth/me').expect(200);
    expect(me.body).toEqual({
      authenticated: true,
      user: { id: 'guest', displayName: 'Guest', roles: [], isGuest: true },
      sessionExpiresAt: expect.any(String),
      csrfToken: guest.csrf,
    });
  });

  it('signing out ends it', async () => {
    const guest = await signInGuest(t);
    await as(guest).get('/api/rigs').expect(200);
    await guest.agent.post('/api/auth/logout').expect(201);
    await as(guest).get('/api/rigs').expect(401);
    expect((await as(guest).get('/api/auth/me')).body).toEqual({ authenticated: false });
  });
});

describe('what a guest sees', () => {
  let admin: SignedIn;
  let guest: SignedIn;
  let rigId: string;
  let gearId: string;
  let eventId: string;
  beforeEach(async () => {
    admin = await signInAs(t, 'admin');
    guest = await signInGuest(t);
    const ada = await createPerson(t, {
      firstName: 'Ada',
      middleName: 'King',
      lastName: 'lovelace',
      email: 'ada@example.com',
      phone: '+18605551234',
      dob: '1990-12-10',
      address: { line1: '1 Analytical Way', city: 'London' },
      emergencyContacts: [{ name: 'Babbage', phone: '+18605550000' }],
    });
    rigId = (
      await as(admin).post('/api/rigs', { name: 'Rig A', primaryUserId: ada.id }).expect(201)
    ).body.id;
    gearId = (
      await as(admin).post('/api/gear', { name: 'Altimeter', assignedPersonId: ada.id }).expect(201)
    ).body.id;
    eventId = (await as(admin).post('/api/events', { name: 'Boogie' }).expect(201)).body.id;
  });

  it('rigs, gear and events, with people as "First L." and no contact details', async () => {
    const rigs = (await as(guest).get('/api/rigs').expect(200)).body;
    expect(rigs[0]).toMatchObject({ name: 'Rig A', primaryUserName: 'Ada L.' });
    const rig = (await as(guest).get(`/api/rigs/${rigId}`).expect(200)).body;
    expect(rig.primaryUserName).toBe('Ada L.');
    const gear = (await as(guest).get('/api/gear').expect(200)).body;
    expect(gear[0]).toMatchObject({ name: 'Altimeter', assignedPersonName: 'Ada L.' });
    const one = (await as(guest).get(`/api/gear/${gearId}`).expect(200)).body;
    expect(one.assignedPersonName).toBe('Ada L.');
    await as(guest).get('/api/events').expect(200);
    await as(guest).get(`/api/events/${eventId}`).expect(200);

    const everything = JSON.stringify([rigs, rig, gear, one]);
    for (const secret of [
      'ada@example.com',
      '5551234',
      '1990-12-10',
      'Analytical',
      'Babbage',
      'King',
      'lovelace',
    ])
      expect(everything).not.toContain(secret);

    // Members still see full names.
    expect((await as(admin).get(`/api/rigs/${rigId}`)).body.primaryUserName).toBe(
      'Ada King lovelace',
    );
    expect((await as(admin).get(`/api/gear/${gearId}`)).body).not.toHaveProperty(
      'assignedPersonName',
    );
  });

  it('cannot read people, the audit log or their own security settings', async () => {
    await as(guest).get('/api/people').expect(403);
    await as(guest).get(`/api/people/${admin.id}`).expect(403);
    await as(guest).get('/api/audit').expect(403);
    await as(guest).get('/api/auth/security').expect(403);
  });

  it('cannot change anything', async () => {
    await as(guest).post('/api/rigs', { name: 'Nope' }).expect(403);
    await as(guest).put(`/api/rigs/${rigId}`, { name: 'Nope' }).expect(403);
    await as(guest).delete(`/api/gear/${gearId}`).expect(403);
    await as(guest).post('/api/events', { name: 'Nope' }).expect(403);
    await as(guest).post('/api/people', { firstName: 'Nope' }).expect(403);
    await as(guest).post('/api/auth/password', { password: 'plum tractor sideways' }).expect(403);
    await as(guest).post('/api/auth/totp/start').expect(403);
    await as(guest).post(`/api/auth/people/${admin.id}/link`).expect(403);
    expect((await as(admin).get(`/api/rigs/${rigId}`)).body.name).toBe('Rig A');
  });

  it('sees photos of rigs, gear and events, but no other uploaded files', async () => {
    const dir = path.join(process.env.UPLOADS_DIR!, 'rig', rigId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cover.jpg'), 'x');
    fs.writeFileSync(path.join(dir, 'stray.jpg'), 'x');
    await t.db.insert(media).values({
      ownerType: 'rig',
      ownerId: rigId,
      url: `/uploads/rig/${rigId}/cover.jpg`,
      kind: 'photo',
    });
    const list = (await as(guest).get(`/api/media?ownerType=rig&ownerId=${rigId}`).expect(200))
      .body;
    expect(list).toHaveLength(1);
    await as(guest).get(`/uploads/rig/${rigId}/cover.jpg`).expect(200);
    await as(guest).get(`/uploads/rig/${rigId}/stray.jpg`).expect(403);
    await as(admin).get(`/uploads/rig/${rigId}/stray.jpg`).expect(200);
  });
});
