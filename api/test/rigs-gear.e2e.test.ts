import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rigs } from '../src/db/schema.js';
import {
  MISSING_ID,
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

const createRig = async (body: object = {}) =>
  (
    await as(user)
      .post('/api/rigs', { name: 'Rig', ...body })
      .expect(201)
  ).body;
const createGear = async (body: object = {}) =>
  (
    await as(user)
      .post('/api/gear', { name: 'Gear', ...body })
      .expect(201)
  ).body;
const getGear = async (id: string) => (await as(user).get(`/api/gear/${id}`).expect(200)).body;

describe('rigs', () => {
  it('create, read, update and delete', async () => {
    const p = await createPerson(t, { firstName: 'Jane', lastName: 'Doe' });
    const rig = await createRig({
      name: 'Javelin',
      number: '7',
      repackDue: '2020-05-01',
      lastPacked: '2024-01-02T03:04:05Z',
      primaryUserId: p.id,
      customFields: { color: 'blue', jumps: 300, checked: true },
    });
    expect(rig).toMatchObject({
      name: 'Javelin',
      number: '7',
      primaryUserId: p.id,
      customFields: { color: 'blue', jumps: 300, checked: true },
    });
    expect(rig.repackDue).toBe('2020-05-01');
    expect(rig.components).toEqual({ container: null, main: null, reserve: null, aad: null });
    // A full timestamp keeps its (UTC) date.
    expect(rig.lastPacked).toBe('2024-01-02');

    const list = (await as(user).get('/api/rigs').expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: rig.id, primaryUserName: 'Jane Doe' });
    expect((await as(user).get(`/api/rigs/${rig.id}`).expect(200)).body).toMatchObject({
      name: 'Javelin',
      primaryUserName: 'Jane Doe',
    });

    const updated = (
      await as(user)
        .put(`/api/rigs/${rig.id}`, { name: 'Javelin II', notes: 'new main' })
        .expect(200)
    ).body;
    expect(updated).toMatchObject({ name: 'Javelin II', notes: 'new main', number: '7' });

    // A blank value clears a field.
    const cleared = (
      await as(user).put(`/api/rigs/${rig.id}`, { notes: '', primaryUserId: null }).expect(200)
    ).body;
    expect(cleared.notes ?? null).toBeNull();
    expect(cleared.primaryUserId ?? null).toBeNull();

    expect((await as(admin).delete(`/api/rigs/${rig.id}`).expect(200)).body).toEqual({
      deleted: true,
    });
    await as(user).get(`/api/rigs/${rig.id}`).expect(404);
    await as(admin).delete(`/api/rigs/${rig.id}`).expect(404);
  });

  it('the primary person must exist', async () => {
    const res = await as(user)
      .post('/api/rigs', { name: 'R', primaryUserId: MISSING_ID })
      .expect(400);
    expect(res.body.message).toMatch(/person/i);
    const rig = await createRig();
    await as(user).put(`/api/rigs/${rig.id}`, { primaryUserId: MISSING_ID }).expect(400);
  });

  it('updating or reading a missing rig is 404', async () => {
    await as(user).get(`/api/rigs/${MISSING_ID}`).expect(404);
    await as(user).put(`/api/rigs/${MISSING_ID}`, { name: 'x' }).expect(404);
  });
});

describe('validation', () => {
  const resources = [
    ['rigs', { name: 'ok' }],
    ['gear', { name: 'ok' }],
    ['events', { name: 'ok' }],
  ] as const;

  describe.each(resources)('/api/%s', (resource, valid) => {
    const bad: Array<[string, object]> = [
      ['an unknown key', { ...valid, isAdmin: true }],
      ['an operator object', { name: { $gt: '' } }],
      ['a too-long name', { name: 'x'.repeat(201) }],
      ['a number for a text field', { name: 42 }],
    ];

    it.each(bad)('POST rejects %s with 400 and a message', async (_what, body) => {
      const res = await as(user).post(`/api/${resource}`, body).expect(400);
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message.length).toBeGreaterThan(0);
    });

    it.each(bad)('PUT rejects %s with 400', async (_what, body) => {
      const created = (await as(user).post(`/api/${resource}`, valid).expect(201)).body;
      await as(user).put(`/api/${resource}/${created.id}`, body).expect(400);
      expect((await as(user).get(`/api/${resource}/${created.id}`)).body.name).toBe('ok');
    });

    it('a malformed :id is 400, not 500', async () => {
      await as(user).get(`/api/${resource}/not-an-id`).expect(400);
      await as(user).put(`/api/${resource}/not-an-id`, valid).expect(400);
      await as(admin).delete(`/api/${resource}/not-an-id`).expect(400);
    });
  });

  it.each([
    ['rigs', 'imageUrl'],
    ['gear', 'imageUrl'],
    ['events', 'eventPhotoUrl'],
    ['events', 'photoUrls'],
  ])('/api/%s refuses the 1.x photo field %s (photos are media)', async (resource, field) => {
    const value = field === 'photoUrls' ? ['/uploads/a.jpg'] : '/uploads/a.jpg';
    const res = await as(user)
      .post(`/api/${resource}`, { name: 'x', [field]: value })
      .expect(400);
    expect(res.body.message).toMatch(/unrecognized|unknown/i);
    const created = (await as(user).post(`/api/${resource}`, { name: 'x' }).expect(201)).body;
    expect(created).not.toHaveProperty(field);
    expect(created).toMatchObject({ media: [], coverUrl: null });
    await as(user)
      .put(`/api/${resource}/${created.id}`, { [field]: value })
      .expect(400);
  });

  it.each([
    ['rigs', 'lastPacked'],
    ['gear', 'dateOfManufacture'],
    ['events', 'eventDate'],
  ])('/api/%s rejects a bad %s', async (resource, field) => {
    for (const value of ['yesterday', '2024-13-01', '01/02/2024', 12345]) {
      await as(user)
        .post(`/api/${resource}`, { name: 'x', [field]: value })
        .expect(400);
    }
    await as(user)
      .post(`/api/${resource}`, { name: 'x', [field]: '2024-02-29' })
      .expect(201);
  });

  it.each([
    ['rigs', 'primaryUserId'],
    ['gear', 'assignedRigId'],
    ['gear', 'assignedPersonId'],
  ])('/api/%s rejects a malformed %s', async (resource, field) => {
    for (const value of ['abc', { $ne: null }, 123]) {
      await as(user)
        .post(`/api/${resource}`, { name: 'x', [field]: value })
        .expect(400);
    }
  });

  it('rig custom fields must be a flat object of short values', async () => {
    await as(user)
      .post('/api/rigs', { customFields: { nested: { a: 1 } } })
      .expect(400);
    await as(user)
      .post('/api/rigs', { customFields: { long: 'x'.repeat(501) } })
      .expect(400);
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`f${i}`, i]));
    await as(user).post('/api/rigs', { customFields: many }).expect(400);
  });

  it('gear filters must be plain strings (?personId[$ne]=x is 400)', async () => {
    await createGear();
    await as(user).get('/api/gear?personId[$ne]=x').expect(400);
    await as(user).get('/api/gear?rigId[$gt]=').expect(400);
  });
});

describe('gear', () => {
  it('create, read, update and delete', async () => {
    const g = await createGear({
      name: 'Cypres 2',
      type: 'AAD',
      serialNumber: 'C-1',
      dateOfManufacture: '2019-06-01',
    });
    expect(g).toMatchObject({ name: 'Cypres 2', type: 'AAD', serialNumber: 'C-1' });
    expect((await as(user).get('/api/gear').expect(200)).body).toHaveLength(1);
    const updated = (await as(user).put(`/api/gear/${g.id}`, { notes: 'serviced' }).expect(200))
      .body;
    expect(updated).toMatchObject({ name: 'Cypres 2', notes: 'serviced' });
    expect((await as(admin).delete(`/api/gear/${g.id}`).expect(200)).body).toEqual({ ok: true });
    await as(user).get(`/api/gear/${g.id}`).expect(404);
    await as(user).put(`/api/gear/${g.id}`, { name: 'x' }).expect(404);
  });

  it('a duplicate serial number is 409', async () => {
    const g = await createGear({ serialNumber: 'SN-1' });
    const res = await as(user)
      .post('/api/gear', { name: 'Other', serialNumber: 'SN-1' })
      .expect(409);
    expect(res.body.message).toMatch(/serial number/);
    const other = await createGear({ serialNumber: 'SN-2' });
    await as(user).put(`/api/gear/${other.id}`, { serialNumber: 'SN-1' }).expect(409);
    // Saving the same serial on the same gear is fine.
    await as(user).put(`/api/gear/${g.id}`, { serialNumber: 'SN-1', name: 'Same' }).expect(200);
  });

  it('clearing a serial removes it, and any number of gear can have no serial', async () => {
    const a = await createGear({ serialNumber: 'SN-A' });
    const b = await createGear({ serialNumber: 'SN-B' });
    await createGear();
    await createGear({ serialNumber: '' });
    await createGear({ serialNumber: null });
    const clearedA = (await as(user).put(`/api/gear/${a.id}`, { serialNumber: '' }).expect(200))
      .body;
    expect(clearedA).not.toHaveProperty('serialNumber');
    const clearedB = (await as(user).put(`/api/gear/${b.id}`, { serialNumber: null }).expect(200))
      .body;
    expect(clearedB).not.toHaveProperty('serialNumber');
    expect(await getGear(a.id)).not.toHaveProperty('serialNumber');
    expect((await as(user).get('/api/gear')).body).toHaveLength(5);
    // The cleared serial is free to use again.
    await createGear({ serialNumber: 'SN-A' });
  });

  it('gear put on a rig follows the rig’s primary person', async () => {
    const p1 = await createPerson(t);
    const rig = await createRig({ primaryUserId: p1.id });
    const g = await createGear({ assignedRigId: rig.id });
    expect(g).toMatchObject({ assignedRigId: rig.id, assignedPersonId: p1.id });
    // A person sent alongside a rig is ignored: the rig decides.
    const p2 = await createPerson(t);
    const g2 = await createGear({ assignedRigId: rig.id, assignedPersonId: p2.id });
    expect(g2).toMatchObject({ assignedRigId: rig.id, assignedPersonId: p1.id });
  });

  it('gear on a rig without a primary person has no person', async () => {
    const rig = await createRig();
    const g = await createGear({ assignedRigId: rig.id });
    expect(g.assignedRigId).toBe(rig.id);
    expect(g.assignedPersonId ?? null).toBeNull();
  });

  it('changing a rig’s primary person moves its gear to them', async () => {
    const p1 = await createPerson(t);
    const p2 = await createPerson(t);
    const rig = await createRig({ primaryUserId: p1.id });
    const g = await createGear({ assignedRigId: rig.id });
    const elsewhere = await createGear({ assignedPersonId: p1.id });
    await as(user).put(`/api/rigs/${rig.id}`, { primaryUserId: p2.id }).expect(200);
    expect(await getGear(g.id)).toMatchObject({ assignedRigId: rig.id, assignedPersonId: p2.id });
    expect((await getGear(elsewhere.id)).assignedPersonId).toBe(p1.id);
    await as(user).put(`/api/rigs/${rig.id}`, { primaryUserId: null }).expect(200);
    expect((await getGear(g.id)).assignedPersonId ?? null).toBeNull();
    // Updating other rig fields leaves the gear's person alone.
    await as(user).put(`/api/rigs/${rig.id}`, { primaryUserId: p1.id }).expect(200);
    await as(user).put(`/api/rigs/${rig.id}`, { name: 'Renamed' }).expect(200);
    expect((await getGear(g.id)).assignedPersonId).toBe(p1.id);
  });

  it('assigning gear to a person takes it off its rig', async () => {
    const p1 = await createPerson(t);
    const p2 = await createPerson(t);
    const rig = await createRig({ primaryUserId: p1.id });
    const g = await createGear({ assignedRigId: rig.id });
    const res = (
      await as(user)
        .put(`/api/gear/${g.id}`, { assignedRigId: null, assignedPersonId: p2.id })
        .expect(200)
    ).body;
    expect(res.assignedRigId ?? null).toBeNull();
    expect(res.assignedPersonId).toBe(p2.id);
  });

  it('assigning to a person directly', async () => {
    const p = await createPerson(t);
    const g = await createGear({ assignedPersonId: p.id });
    expect(g.assignedPersonId).toBe(p.id);
    expect(g.assignedRigId ?? null).toBeNull();
    expect(
      (await as(user).get(`/api/gear?personId=${p.id}`)).body.map((x: { id: string }) => x.id),
    ).toEqual([g.id]);
  });

  it('unassigning clears both rig and person', async () => {
    const p = await createPerson(t);
    const rig = await createRig({ primaryUserId: p.id });
    const g1 = await createGear({ assignedRigId: rig.id });
    const g2 = await createGear({ assignedPersonId: p.id });
    const r1 = (await as(user).put(`/api/gear/${g1.id}`, { assignedRigId: null }).expect(200)).body;
    expect(r1.assignedRigId ?? null).toBeNull();
    expect(r1.assignedPersonId ?? null).toBeNull();
    const r2 = (
      await as(user)
        .put(`/api/gear/${g2.id}`, { assignedRigId: '', assignedPersonId: '' })
        .expect(200)
    ).body;
    expect(r2.assignedRigId ?? null).toBeNull();
    expect(r2.assignedPersonId ?? null).toBeNull();
    expect((await as(user).get('/api/gear?unassigned=true')).body).toHaveLength(2);
  });

  it('a missing rig or person is 400', async () => {
    await as(user).post('/api/gear', { assignedRigId: MISSING_ID }).expect(400);
    await as(user).post('/api/gear', { assignedPersonId: MISSING_ID }).expect(400);
    const g = await createGear();
    await as(user).put(`/api/gear/${g.id}`, { assignedRigId: MISSING_ID }).expect(400);
    await as(user).put(`/api/gear/${g.id}`, { assignedPersonId: MISSING_ID }).expect(400);
  });

  it('filters by rig, person and unassigned', async () => {
    const p = await createPerson(t);
    const rig = await createRig({ primaryUserId: p.id });
    const onRig = await createGear({ assignedRigId: rig.id });
    const withPerson = await createGear({ assignedPersonId: p.id });
    const loose = await createGear();
    const ids = async (q: string) =>
      (await as(user).get(`/api/gear${q}`).expect(200)).body
        .map((g: { id: string }) => g.id)
        .sort();
    expect(await ids(`?rigId=${rig.id}`)).toEqual([onRig.id]);
    expect(await ids(`?personId=${p.id}`)).toEqual([onRig.id, withPerson.id].sort());
    expect(await ids('?unassigned=true')).toEqual([loose.id]);
  });

  it('deleting a rig unassigns its gear', async () => {
    const p = await createPerson(t);
    const rig = await createRig({ primaryUserId: p.id });
    const g = await createGear({ assignedRigId: rig.id });
    await as(admin).delete(`/api/rigs/${rig.id}`).expect(200);
    const after = await getGear(g.id);
    expect(after.assignedRigId ?? null).toBeNull();
    expect(after.assignedPersonId ?? null).toBeNull();
  });

  it('gear whose rig was deleted outside the API is off that rig and can be edited', async () => {
    // Gear can no longer point at a missing rig (foreign key); a rig deleted straight in the
    // database takes its gear off the rig (ON DELETE SET NULL) but leaves the gear's person.
    const p = await createPerson(t);
    const rig = await createRig({ primaryUserId: p.id });
    const g = await createGear({ assignedRigId: rig.id });
    await t.db.delete(rigs).where(eq(rigs.id, rig.id));
    const insertedId = g.id;
    const res = (await as(user).put(`/api/gear/${insertedId}`, { name: 'Orphan 2' }).expect(200))
      .body;
    expect(res.name).toBe('Orphan 2');
    expect(res.assignedRigId ?? null).toBeNull();
    const res2 = (
      await as(user)
        .put(`/api/gear/${insertedId}`, { assignedPersonId: p.id, notes: 'x' })
        .expect(200)
    ).body;
    expect(res2.assignedPersonId).toBe(p.id);
  });

  it('deleting a person clears them from rigs and gear', async () => {
    const p = await createPerson(t);
    const rig = await createRig({ primaryUserId: p.id });
    const onRig = await createGear({ assignedRigId: rig.id });
    const direct = await createGear({ assignedPersonId: p.id });
    await as(admin).delete(`/api/people/${p.id}`).expect(200);
    const r = (await as(user).get(`/api/rigs/${rig.id}`)).body;
    expect(r.primaryUserId ?? null).toBeNull();
    expect((await getGear(onRig.id)).assignedPersonId ?? null).toBeNull();
    expect((await getGear(onRig.id)).assignedRigId).toBe(rig.id);
    expect((await getGear(direct.id)).assignedPersonId ?? null).toBeNull();
  });
});
