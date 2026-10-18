import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, noticeDismissals, noticeReads, notices, rigs } from '../src/db/schema.js';
import {
  anon,
  as,
  createPerson,
  createTestApp,
  MISSING_ID,
  resetDb,
  signIn,
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

let admin: SignedIn;
let user: SignedIn;
let viewer: SignedIn;
let guest: SignedIn;
beforeEach(async () => {
  await resetDb(t);
  admin = await signInAs(t, 'admin', {
    firstName: 'Ada',
    lastName: 'Admin',
    phone: '+18605550001',
  });
  user = await signInAs(t, 'user', { firstName: 'Uma', lastName: 'User', phone: '+18605550002' });
  viewer = await signInAs(t, 'viewer', { firstName: 'Vic', lastName: 'Viewer', phone: null });
  guest = await signInGuest(t);
});

const post = (body: object) => as(admin).post('/api/notices', body);
const titles = (list: { title: string | null; body: string }[]) =>
  list.map((n) => n.title ?? n.body);
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('who can post, read and change notices', () => {
  it('admins post, edit and delete; users, viewers and guests cannot', async () => {
    const { body: n } = await post({ title: 'Boogie Saturday', body: 'Bring your rig.' }).expect(
      201,
    );
    expect(n).toMatchObject({
      title: 'Boogie Saturday',
      audience: 'everyone',
      pinned: false,
      bannerUntil: null,
      authorName: 'Ada Admin',
    });
    for (const who of [user, viewer]) {
      await as(who).post('/api/notices', { body: 'Hi' }).expect(403);
      await as(who).patch(`/api/notices/${n.id}`, { body: 'Hi' }).expect(403);
      await as(who).delete(`/api/notices/${n.id}`).expect(403);
      await as(who).get(`/api/notices/${n.id}/phones`).expect(403);
    }
    await as(guest).post('/api/notices', { body: 'Hi' }).expect(403);
    await as(guest).delete(`/api/notices/${n.id}`).expect(403);
    await as(guest)
      .post('/api/notices/read', { ids: [n.id] })
      .expect(403);
    await as(guest)
      .post('/api/notices/dismiss', { ids: [n.id] })
      .expect(403);
    await anon(t).get('/api/notices').expect(401);
    await anon(t).get('/api/notices/banners').expect(401);

    const edited = (await as(admin).patch(`/api/notices/${n.id}`, { title: 'Boogie Sunday' })).body;
    expect(edited).toMatchObject({ title: 'Boogie Sunday', body: 'Bring your rig.' });
    expect(edited.updatedAt).not.toBeNull();
    await as(admin).delete(`/api/notices/${n.id}`).expect(200);
    await as(admin).delete(`/api/notices/${n.id}`).expect(404);
    await as(admin).patch(`/api/notices/${MISSING_ID}`, { body: 'x' }).expect(404);
  });

  it('checks what is sent', async () => {
    await post({ body: '' }).expect(400);
    await post({ body: 'x'.repeat(1001) }).expect(400);
    await post({ title: 'x'.repeat(101), body: 'ok' }).expect(400);
    await post({ body: 'ok', audience: 'league' }).expect(400);
    await post({ body: 'ok', audience: 'person' }).expect(400);
    await post({ body: 'ok', recipientId: user.id }).expect(400);
    await post({ body: 'ok', audience: 'person', recipientId: MISSING_ID }).expect(400);
    await post({ body: 'ok', color: 'red' }).expect(400);
    await post({ body: 'ok', bannerUntil: 'soon' }).expect(400);
    await post({ body: 'ok', pinned: 'yes' }).expect(400);
    await as(admin).patch(`/api/notices/${MISSING_ID}`, { audience: 'public' }).expect(400);
    await as(admin).get('/api/notices?limit[$gt]=1').expect(400);
    await as(admin).post('/api/notices/dismiss', {}).expect(400);
    await as(admin)
      .post('/api/notices/dismiss', { keys: ['rigs:all'] })
      .expect(400);
    const { body: blank } = await post({ title: '  ', body: ' Hello ' }).expect(201);
    expect(blank).toMatchObject({ title: null, body: 'Hello' });
  });

  it('records posting, editing and deleting in the Activity log', async () => {
    const { body: n } = await post({ title: 'Rigging day', body: 'Hangar 2' }).expect(201);
    await as(admin).patch(`/api/notices/${n.id}`, { pinned: true }).expect(200);
    await as(admin).delete(`/api/notices/${n.id}`).expect(200);
    const entries = await t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resource, 'notices'))
      .orderBy(auditLog.createdAt);
    expect(entries.map((e) => [e.action, e.resourceName, e.userId])).toEqual([
      ['CREATE', 'Rigging day', admin.id],
      ['UPDATE', 'Rigging day', admin.id],
      ['DELETE', 'Rigging day', admin.id],
    ]);
    expect(entries[1]!.before).toMatchObject({ pinned: false });
    expect(entries[1]!.after).toMatchObject({ pinned: true });
    const { body: log } = await as(admin).get('/api/audit?resource=notices').expect(200);
    expect(log.total).toBe(3);
  });
});

describe('audiences', () => {
  it('everyone, one person or the public: each sees only what is for them', async () => {
    await post({ body: 'To everyone' }).expect(201);
    await post({ body: 'To Uma', audience: 'person', recipientId: user.id }).expect(201);
    await post({ body: 'To the public', audience: 'public' }).expect(201);

    const forUser = (await as(user).get('/api/notices').expect(200)).body;
    expect(titles(forUser).sort()).toEqual(['To Uma', 'To everyone', 'To the public']);
    expect(forUser.find((n: { body: string }) => n.body === 'To Uma').to).toBe('You');

    const forViewer = (await as(viewer).get('/api/notices').expect(200)).body;
    expect(titles(forViewer).sort()).toEqual(['To everyone', 'To the public']);

    // Admins see notices to others too, with who they're for, but not as their banners.
    const forAdmin = (await as(admin).get('/api/notices').expect(200)).body;
    const toUma = forAdmin.find((n: { body: string }) => n.body === 'To Uma');
    expect(toUma).toMatchObject({ to: 'Uma User', banner: false });
    expect(titles((await as(admin).get('/api/notices/banners')).body).sort()).toEqual([
      'To everyone',
      'To the public',
    ]);

    const forGuest = (await as(guest).get('/api/notices').expect(200)).body;
    expect(forGuest).toEqual([
      expect.objectContaining({
        body: 'To the public',
        to: 'RigTracker',
        author: null,
        read: false,
        banner: true,
      }),
    ]);
    expect(titles((await as(guest).get('/api/notices/banners').expect(200)).body)).toEqual([
      'To the public',
    ]);
    await as(guest).get('/api/notices?limit=5').expect(200);
  });

  it("a person's notices go when they're deleted, with everyone's read state of them", async () => {
    const sam = await createPerson(t, { firstName: 'Sam', roles: ['user'] });
    const samIn = await signIn(t, sam.id);
    const { body: toSam } = await post({
      body: 'For Sam',
      audience: 'person',
      recipientId: sam.id,
    }).expect(201);
    const { body: all } = await post({ body: 'For all' }).expect(201);
    await as(samIn)
      .post('/api/notices/read', { ids: [all.id] })
      .expect(200);
    await t.db
      .insert(noticeDismissals)
      .values({ personId: sam.id, key: 'repacks:0123456789abcdef' });
    await as(admin).delete(`/api/people/${sam.id}`).expect(200);
    expect(await t.db.select().from(notices).where(eq(notices.id, toSam.id))).toEqual([]);
    expect(await t.db.select().from(notices).where(eq(notices.id, all.id))).toHaveLength(1);
    expect(await t.db.select().from(noticeReads).where(eq(noticeReads.personId, sam.id))).toEqual(
      [],
    );
    expect(
      await t.db.select().from(noticeDismissals).where(eq(noticeDismissals.personId, sam.id)),
    ).toEqual([]);
  });

  it('gives admins the mobile numbers to text it to, and how many have none', async () => {
    const { body: n } = await post({ body: 'Everyone' }).expect(201);
    // Uma has a phone, Vic doesn't; Ada (the admin) is left out; no-sign-in people too.
    await createPerson(t, { firstName: 'Nobody', phone: '+18605550099' });
    expect(n).toMatchObject({ phones: ['+18605550002'], skipped: 1 });
    expect((await as(admin).get(`/api/notices/${n.id}/phones`).expect(200)).body).toEqual({
      phones: ['+18605550002'],
      skipped: 1,
    });
    const { body: one } = await post({
      body: 'Just Vic',
      audience: 'person',
      recipientId: viewer.id,
    }).expect(201);
    expect(one).toMatchObject({ phones: [], skipped: 1 });
  });
});

describe('read, dismissed and banners', () => {
  it('pinned first, then newest; read and dismissed per person; an edit makes it new again', async () => {
    const { body: a } = await post({ body: 'Older' }).expect(201);
    const { body: b } = await post({ body: 'Newer' }).expect(201);
    const { body: p } = await post({ body: 'Must see', pinned: true }).expect(201);
    expect(titles((await as(user).get('/api/notices')).body)).toEqual([
      'Must see',
      'Newer',
      'Older',
    ]);
    expect(titles((await as(user).get('/api/notices/banners')).body)).toEqual([
      'Must see',
      'Newer',
      'Older',
    ]);
    expect((await as(user).get('/api/notices?limit=1')).body).toHaveLength(1);

    await as(user)
      .post('/api/notices/read', { ids: [a.id, b.id] })
      .expect(200);
    await as(user)
      .post('/api/notices/dismiss', { ids: [p.id] })
      .expect(200);
    const list = (await as(user).get('/api/notices')).body as {
      id: string;
      read: boolean;
      dismissed: boolean;
      banner: boolean;
    }[];
    expect(list.map((n) => [n.read, n.dismissed, n.banner])).toEqual([
      [true, true, false],
      [true, false, true],
      [true, false, true],
    ]);
    expect(titles((await as(user).get('/api/notices/banners')).body)).toEqual(['Newer', 'Older']);
    // Someone else's state is their own.
    expect(
      ((await as(viewer).get('/api/notices')).body as { read: boolean }[]).every((n) => !n.read),
    ).toBe(true);

    await as(admin).patch(`/api/notices/${p.id}`, { body: 'Must see (updated)' }).expect(200);
    const again = (await as(user).get('/api/notices')).body[0];
    expect(again).toMatchObject({
      body: 'Must see (updated)',
      read: false,
      dismissed: false,
      banner: true,
    });
  });

  it('a viewer can mark notices read and dismiss them; not ones meant for someone else', async () => {
    const { body: toUma } = await post({
      body: 'For Uma',
      audience: 'person',
      recipientId: user.id,
    }).expect(201);
    await as(viewer)
      .post('/api/notices/read', { ids: [toUma.id] })
      .expect(200);
    expect(await t.db.select().from(noticeReads)).toEqual([]);
    await as(user)
      .post('/api/notices/dismiss', { ids: [toUma.id] })
      .expect(200);
    expect(
      await t.db
        .select()
        .from(noticeReads)
        .where(and(eq(noticeReads.personId, user.id), eq(noticeReads.noticeId, toUma.id))),
    ).toHaveLength(1);
  });

  it('banners last a week by default, two days for one person, or until banner_until', async () => {
    const { body: ended } = await post({ body: 'Ended', bannerUntil: day(-1) }).expect(201);
    const { body: until } = await post({ body: 'Until tomorrow', bannerUntil: day(1) }).expect(201);
    const { body: old } = await post({ body: 'Old' }).expect(201);
    const { body: oldPerson } = await post({
      body: 'Old, for Uma',
      audience: 'person',
      recipientId: user.id,
    }).expect(201);
    const { body: oldPinned } = await post({ body: 'Old pinned', pinned: true }).expect(201);
    await t.db
      .update(notices)
      .set({ createdAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(notices.id, old.id));
    await t.db
      .update(notices)
      .set({ createdAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(notices.id, oldPerson.id));
    await t.db
      .update(notices)
      .set({ createdAt: new Date(Date.now() - 90 * 86_400_000) })
      .where(eq(notices.id, oldPinned.id));

    const list = (await as(user).get('/api/notices')).body as {
      id: string;
      banner: boolean;
      bannerUntil: string | null;
    }[];
    const byId = new Map(list.map((n) => [n.id, n]));
    expect(byId.get(ended.id)!.banner).toBe(false);
    expect(byId.get(until.id)).toMatchObject({
      banner: true,
      bannerUntil: `${day(1)}T23:59:59.999Z`,
    });
    expect(byId.get(old.id)!.banner).toBe(false);
    expect(byId.get(oldPerson.id)!.banner).toBe(false);
    expect(byId.get(oldPinned.id)).toMatchObject({ banner: true, bannerUntil: null });
    // Every one of them stays in the list.
    expect(list).toHaveLength(5);
    expect(titles((await as(user).get('/api/notices/banners')).body)).toEqual([
      'Old pinned',
      'Until tomorrow',
    ]);

    // A pinned notice with an end stops then too.
    await as(admin)
      .patch(`/api/notices/${oldPinned.id}`, { bannerUntil: day(-2) })
      .expect(200);
    expect(titles((await as(user).get('/api/notices/banners')).body)).toEqual(['Until tomorrow']);
  });
});

describe('repack reminders', () => {
  const rig = (fields: Partial<typeof rigs.$inferInsert>) =>
    t.db
      .insert(rigs)
      .values(fields)
      .returning()
      .then(([r]) => r!);

  it("a rig's primary person gets one when it's due within 14 days or overdue", async () => {
    const soon = await rig({ number: '6', repackDue: day(5), primaryUserId: user.id });
    const late = await rig({ number: '7', repackDue: day(-3), primaryUserId: user.id });
    await rig({ number: '8', repackDue: day(30), primaryUserId: user.id });
    await rig({ number: '9', repackDue: '1900-01-01', primaryUserId: user.id });
    await rig({ number: '10', repackDue: day(1), primaryUserId: viewer.id });

    const banners = (await as(user).get('/api/notices/banners').expect(200)).body;
    expect(banners).toEqual([
      expect.objectContaining({
        id: `repack:${late.id}:${day(-3)}`,
        automatic: true,
        title: expect.stringMatching(/^Rig #7 repack overdue since \w{3} \d{1,2}/),
        urgent: true,
        link: `/rigs/${late.id}`,
      }),
      expect.objectContaining({
        id: `repack:${soon.id}:${day(5)}`,
        title: expect.stringMatching(/^Rig #6 repack due \w{3} \d{1,2}/),
        urgent: false,
        label: 'Your rig',
      }),
    ]);
    // They aren't stored notices.
    expect((await as(user).get('/api/notices')).body).toEqual([]);
    expect(titles((await as(viewer).get('/api/notices/banners')).body)).toHaveLength(1);
    expect((await as(guest).get('/api/notices/banners')).body).toEqual([]);

    // Dismissed per person, per rig and due date: a new due date brings it back.
    await as(user)
      .post('/api/notices/dismiss', { keys: [banners[0].id] })
      .expect(200);
    await as(user)
      .post('/api/notices/dismiss', { keys: [banners[0].id] })
      .expect(200);
    expect((await as(user).get('/api/notices/banners')).body).toHaveLength(1);
    await t.db
      .update(rigs)
      .set({ repackDue: day(-1) })
      .where(eq(rigs.id, late.id));
    expect((await as(user).get('/api/notices/banners')).body[0].id).toBe(
      `repack:${late.id}:${day(-1)}`,
    );
  });

  it('admins get one summary linking to the rigs, dismissed until the list changes', async () => {
    await rig({ number: '1', repackDue: day(-10) });
    await rig({ number: '2', repackDue: day(-1), primaryUserId: user.id });
    const third = await rig({ number: '3', repackDue: day(14) });
    await rig({ number: '4', repackDue: day(15) });

    const [summary] = (await as(admin).get('/api/notices/banners')).body;
    expect(summary).toMatchObject({
      automatic: true,
      title: '2 rigs overdue, 1 due within 14 days',
      label: 'Repacks',
      urgent: true,
      link: '/rigs?filter=repack',
    });
    expect(summary.id).toMatch(/^repacks:[0-9a-f]{16}$/);
    // Users and viewers don't get the summary.
    expect(titles((await as(viewer).get('/api/notices/banners')).body)).toEqual([]);

    await as(admin)
      .post('/api/notices/dismiss', { keys: [summary.id] })
      .expect(200);
    expect((await as(admin).get('/api/notices/banners')).body).toEqual([]);
    await t.db
      .update(rigs)
      .set({ repackDue: day(60) })
      .where(eq(rigs.id, third.id));
    expect((await as(admin).get('/api/notices/banners')).body).toEqual([
      expect.objectContaining({ title: '2 rigs overdue' }),
    ]);
  });
});
