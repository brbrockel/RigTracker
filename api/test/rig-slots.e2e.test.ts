import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rigs } from '../src/db/schema.js';
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
const getRig = async (id: string) => (await as(user).get(`/api/rigs/${id}`).expect(200)).body;

describe('rig components (gear slots)', () => {
  it('gear in a slot shows as the rig’s component in the list and the detail', async () => {
    const rig = await createRig({ number: '4' });
    const main = await createGear({
      name: 'Storm 150',
      type: 'Main',
      serialNumber: 'ST-1',
      dateOfManufacture: '2019-01-02',
      imageUrl: '/uploads/gear/a.jpg',
      assignedRigId: rig.id,
      slot: 'main',
    });
    expect(main.slot).toBe('main');
    const aad = await createGear({ name: 'Cypres 2', assignedRigId: rig.id, slot: 'aad' });
    await createGear({ name: 'Slider', assignedRigId: rig.id });

    const expected = {
      container: null,
      main: {
        id: main.id,
        name: 'Storm 150',
        type: 'Main',
        serialNumber: 'ST-1',
        dateOfManufacture: '2019-01-02',
        imageUrl: '/uploads/gear/a.jpg',
      },
      reserve: null,
      aad: {
        id: aad.id,
        name: 'Cypres 2',
        type: null,
        serialNumber: null,
        dateOfManufacture: null,
        imageUrl: null,
      },
    };
    expect((await getRig(rig.id)).components).toEqual(expected);
    const list = (await as(user).get('/api/rigs').expect(200)).body;
    expect(list[0].components).toEqual(expected);
    // An update answers with the components too.
    const updated = (await as(user).put(`/api/rigs/${rig.id}`, { notes: 'x' }).expect(200)).body;
    expect(updated.components).toEqual(expected);
    // Other gear on the rig has no slot.
    const other = (await as(user).get(`/api/gear?rigId=${rig.id}`)).body.find(
      (g: { name: string }) => g.name === 'Slider',
    );
    expect(other.slot ?? null).toBeNull();
  });

  it('rig responses no longer include the old component fields', async () => {
    const rig = await createRig();
    await t.db.update(rigs).set({ mainSize: 'Storm 150' }).where(eq(rigs.id, rig.id));
    for (const body of [rig, await getRig(rig.id), (await as(user).get('/api/rigs')).body[0]]) {
      expect(body).not.toHaveProperty('mainSize');
      expect(body).not.toHaveProperty('containerSerialNumber');
      expect(body).not.toHaveProperty('aadDOM');
      expect(body).not.toHaveProperty('legacyId');
    }
  });

  it.each([
    ['container', 'I4'],
    ['containerSerialNumber', '12685'],
    ['mainSize', 'Storm 150'],
    ['reserveDOM', '2020-01-01'],
    ['aadType', 'Cypres'],
  ])('a rig body with the old field %s is 400', async (field, value) => {
    await as(user)
      .post('/api/rigs', { name: 'R', [field]: value })
      .expect(400);
    const rig = await createRig();
    await as(user)
      .put(`/api/rigs/${rig.id}`, { [field]: value })
      .expect(400);
  });

  it('a slot needs a rig', async () => {
    const res = await as(user).post('/api/gear', { name: 'Main', slot: 'main' }).expect(400);
    expect(res.body.message).toMatch(/rig/i);
    const p = await createPerson(t);
    await as(user)
      .post('/api/gear', { name: 'Main', slot: 'main', assignedPersonId: p.id })
      .expect(400);
    const g = await createGear();
    await as(user).put(`/api/gear/${g.id}`, { slot: 'reserve' }).expect(400);
    await as(user).post('/api/gear', { name: 'x', slot: 'helmet' }).expect(400);
    // Blank or null: not a component.
    expect((await createGear({ slot: '' })).slot ?? null).toBeNull();
    expect((await createGear({ slot: null })).slot ?? null).toBeNull();
  });

  it('a rig has one of each: a taken slot is 409 with the rig number', async () => {
    const rig = await createRig({ number: '7' });
    const first = await createGear({ assignedRigId: rig.id, slot: 'reserve' });
    const res = await as(user)
      .post('/api/gear', { name: 'Other', assignedRigId: rig.id, slot: 'reserve' })
      .expect(409);
    expect(res.body.message).toBe('Rig #7 already has a reserve');
    const g = await createGear({ assignedRigId: rig.id });
    const res2 = await as(user).put(`/api/gear/${g.id}`, { slot: 'reserve' }).expect(409);
    expect(res2.body.message).toBe('Rig #7 already has a reserve');
    const loose = await createGear();
    await as(user)
      .put(`/api/gear/${loose.id}`, { assignedRigId: rig.id, slot: 'reserve' })
      .expect(409);
    // Saving the same gear in its own slot is fine, as is another slot or another rig.
    await as(user).put(`/api/gear/${first.id}`, { slot: 'reserve', name: 'Smart 150' }).expect(200);
    await as(user).put(`/api/gear/${g.id}`, { slot: 'aad' }).expect(200);
    const res3 = await as(user)
      .put(`/api/gear/${loose.id}`, { assignedRigId: rig.id, slot: 'aad' })
      .expect(409);
    expect(res3.body.message).toBe('Rig #7 already has an AAD');
    const rig2 = await createRig({ number: '8' });
    await as(user)
      .put(`/api/gear/${loose.id}`, { assignedRigId: rig2.id, slot: 'reserve' })
      .expect(200);
  });

  it('the database refuses two gear in one slot even without the check (409)', async () => {
    const rig = await createRig({ number: '3' });
    await createGear({ assignedRigId: rig.id, slot: 'main' });
    const g = await createGear({ assignedRigId: rig.id });
    // Straight into the database: the partial unique index refuses it.
    await expect(
      t.db.execute(`update gear set slot = 'main' where id = '${g.id}'`),
    ).rejects.toThrow();
  });

  it('moving a component between rigs or off its rig clears or changes its slot', async () => {
    const p = await createPerson(t);
    const rigA = await createRig({ number: '1' });
    const rigB = await createRig({ number: '2' });
    const g = await createGear({ assignedRigId: rigA.id, slot: 'main' });

    // To another rig without a slot sent: other gear there.
    const moved = (await as(user).put(`/api/gear/${g.id}`, { assignedRigId: rigB.id }).expect(200))
      .body;
    expect(moved.slot ?? null).toBeNull();
    await as(user).put(`/api/gear/${g.id}`, { slot: 'main' }).expect(200);
    // Other changes keep the slot.
    expect((await as(user).put(`/api/gear/${g.id}`, { notes: 'x' }).expect(200)).body.slot).toBe(
      'main',
    );
    // Taken off the slot only.
    const off = (await as(user).put(`/api/gear/${g.id}`, { slot: null }).expect(200)).body;
    expect(off).toMatchObject({ assignedRigId: rigB.id });
    expect(off.slot ?? null).toBeNull();
    await as(user).put(`/api/gear/${g.id}`, { slot: 'main' }).expect(200);

    // Unassigned: no slot.
    const loose = (await as(user).put(`/api/gear/${g.id}`, { assignedRigId: null }).expect(200))
      .body;
    expect(loose.slot ?? null).toBeNull();
    expect((await getRig(rigB.id)).components.main).toBeNull();

    // Given to a person: no slot.
    await as(user).put(`/api/gear/${g.id}`, { assignedRigId: rigB.id, slot: 'main' }).expect(200);
    const toPerson = (
      await as(user)
        .put(`/api/gear/${g.id}`, { assignedRigId: null, assignedPersonId: p.id })
        .expect(200)
    ).body;
    expect(toPerson.slot ?? null).toBeNull();
    expect(toPerson.assignedPersonId).toBe(p.id);

    // Rig deleted: the gear comes off it, slot and all.
    await as(user).put(`/api/gear/${g.id}`, { assignedRigId: rigB.id, slot: 'main' }).expect(200);
    await as(admin).delete(`/api/rigs/${rigB.id}`).expect(200);
    const after = await getGear(g.id);
    expect(after.assignedRigId ?? null).toBeNull();
    expect(after.slot ?? null).toBeNull();
    // Its slot is free on another rig.
    await as(user).put(`/api/gear/${g.id}`, { assignedRigId: rigA.id, slot: 'main' }).expect(200);
  });

  it('gear whose rig was deleted outside the API loses its slot when next saved', async () => {
    const rig = await createRig();
    const g = await createGear({ assignedRigId: rig.id, slot: 'container' });
    await t.db.delete(rigs).where(eq(rigs.id, rig.id));
    const res = (await as(user).put(`/api/gear/${g.id}`, { name: 'Orphan' }).expect(200)).body;
    expect(res.slot ?? null).toBeNull();
  });

  it('slot changes are in the audit log’s before and after', async () => {
    const rig = await createRig({ number: '5' });
    const g = await createGear({ assignedRigId: rig.id });
    await as(user).put(`/api/gear/${g.id}`, { slot: 'container' }).expect(200);
    const entries = (await as(admin).get('/api/audit?resource=gear').expect(200)).body;
    const list = entries.logs;
    const update = list.find((e: { action: string }) => e.action === 'UPDATE');
    expect(update.before.slot ?? null).toBeNull();
    expect(update.after.slot).toBe('container');
  });
});
