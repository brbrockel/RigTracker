import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gear, rigs } from '../src/db/schema.js';
import { moveRigComponents } from '../src/scripts/rig-components.js';
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
let user: SignedIn;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());

const ids: Record<string, string> = {};
let p1: string;
let p2: string;

/** The production rigs and gear (2026-10-18) that matter for the move, as they are. */
async function seed() {
  p1 = (await createPerson(t, { firstName: 'Pat' })).id;
  p2 = (await createPerson(t, { firstName: 'Sam' })).id;
  const rigRows = await t.db
    .insert(rigs)
    .values([
      { number: '4', name: 'Four', mainSize: 'Storm 150' },
      {
        number: '5',
        name: 'Five',
        container: 'I4',
        containerSerialNumber: '12685',
        containerDOM: '2015-03-01',
        mainSize: 'Pilot 188',
        mainSerialNumber: 'PT188-13065',
        reserveSize: 'Smart 150',
        reserveSerialNumber: '',
        customFields: { 'Reserve Serial Number': '12838', color: 'red' },
      },
      {
        number: '6',
        name: 'Six',
        primaryUserId: p1,
        container: 'V-350',
        containerSerialNumber: '77917',
        containerDOM: '2011-01-01',
        mainSize: 'Storm 190',
        reserveSize: 'PR 176',
        reserveSerialNumber: '64447',
        aadType: 'Vigil Cuatro',
        aadSerialNumber: '62715',
        aadDOM: '2019-05-01',
      },
      { number: '7', name: 'Seven', mainSize: 'Storm 170' },
      { number: '8', name: 'Eight', mainSize: 'Storm 170', mainSerialNumber: 'TF-170 00382' },
      { number: '9', name: 'Nine', mainSize: 'Storm 190' },
      {
        number: '10',
        name: 'Ten',
        container: 'V353',
        containerSerialNumber: '82818',
        mainSize: 'Storm 210',
        reserveSize: 'Smart 220',
        reserveSerialNumber: '12851',
        aadType: 'Cypress II',
        aadSerialNumber: 'H2045',
      },
      {
        number: '11',
        name: 'Eleven',
        container: 'I6',
        containerSerialNumber: '12376',
        mainSize: 'Pilot 210',
        reserveSize: 'Smart 175',
        reserveSerialNumber: '12405',
        aadType: 'Cypress II',
        aadSerialNumber: '50758',
      },
      {
        number: '12',
        name: 'Twelve',
        container: 'N/A',
        containerSerialNumber: '12376',
        mainSize: 'Pilot 188',
        reserveSize: 'n/a',
        reserveSerialNumber: ' ',
        aadType: '-',
      },
    ])
    .returning();
  for (const r of rigRows) ids[`rig${r.number}`] = r.id;

  const gearRows = await t.db
    .insert(gear)
    .values([
      // Matched by serial despite the trailing space; date made filled from the rig.
      { legacyId: 'i4', name: 'Infinity I4', type: 'Container', serialNumber: '12685 ' },
      // With a person: goes with rig 6's person; its own date made is kept.
      {
        legacyId: 'v350',
        name: 'Vector V-350',
        type: 'Container ',
        serialNumber: '77917',
        dateOfManufacture: '2010-01-01',
        assignedPersonId: p2,
      },
      // The reserve whose serial is only in rig 5's custom fields.
      { legacyId: 'smart150', name: 'Smart 150', type: 'Reserve ', serialNumber: '12838' },
      // Already on rig 10 (not in a slot), serial in another case.
      {
        legacyId: 'cypres',
        name: 'Cypres 2',
        type: 'Aad',
        serialNumber: 'h2045',
        assignedRigId: ids.rig10,
      },
      // Claimed by rig 11 and rig 12.
      { legacyId: 'i6', name: 'I6', type: 'Container', serialNumber: '12376' },
      { name: 'PC 1', type: 'Pilot chute' },
      { name: 'PC 2', type: 'Pilot chute' },
      { name: 'PC 3', type: 'Pilot chute ' },
      { name: 'PC 4', type: 'Pilot Chute' },
      { name: 'Riser 1', type: 'Riser' },
      { name: 'Riser 2', type: 'Risers' },
      { name: 'Bag', type: 'Dbag' },
      { name: 'Free bag', type: 'Free bag' },
      { name: 'Handle', type: 'Cutaway handle' },
      { name: 'Handle', type: 'Reserve handle' },
    ])
    .returning();
  for (const g of gearRows) if (g.legacyId) ids[g.legacyId] = g.id;
}

const allGear = () => t.db.select().from(gear).orderBy(asc(gear.createdAt), asc(gear.name));
const allRigs = () => t.db.select().from(rigs).orderBy(asc(rigs.createdAt));
const rigApi = async (n: string) =>
  (
    await as(user)
      .get(`/api/rigs/${ids[`rig${n}`]}`)
      .expect(200)
  ).body;
const quiet = { log: () => undefined };

describe('scripts/rig-components', () => {
  beforeEach(async () => {
    await resetDb(t);
    user = await signInAs(t, 'user');
    await seed();
  });

  it('a dry run reports the plan and writes nothing', async () => {
    const before = { gear: await allGear(), rigs: await allRigs() };
    const lines: string[] = [];
    const report = await moveRigComponents({ db: t.db, apply: false, log: (l) => lines.push(l) });
    expect(report.applied).toBe(false);
    expect(report.matched).toBe(5);
    expect(report.created).toBe(15);
    expect(await allGear()).toEqual(before.gear);
    expect(await allRigs()).toEqual(before.rigs);
    const out = lines.join('\n');
    expect(out).toMatch(/^Dry run/);
    expect(out).toMatch(/#12 +CONFLICT #12376/);
    expect(out).toMatch(/Summary: 5 gear matched by serial, 15 created/);
  });

  it('--apply moves the components into gear slots, and a second run changes nothing', async () => {
    const report = await moveRigComponents({ db: t.db, apply: true, ...quiet });
    expect(report.applied).toBe(true);
    expect(report).toMatchObject({ matched: 5, created: 15, alreadyDone: 0, datesFilled: 1 });

    // Rig 5: container matched (trailing-space serial), reserve from the custom field.
    const five = await rigApi('5');
    expect(five.components.container).toMatchObject({
      id: ids.i4,
      name: 'Infinity I4',
      dateOfManufacture: '2015-03-01',
    });
    expect(five.components.main).toMatchObject({
      name: 'Pilot 188',
      type: 'Main',
      serialNumber: 'PT188-13065',
    });
    expect(five.components.reserve).toMatchObject({ id: ids.smart150, type: 'Reserve' });
    expect(five.components.aad).toBeNull();
    expect(five.customFields).toEqual({ color: 'red' });

    // Rig 6: the container goes with the rig's person; its own date made is kept.
    const six = await rigApi('6');
    expect(six.components.container).toMatchObject({
      id: ids.v350,
      type: 'Container',
      dateOfManufacture: '2010-01-01',
    });
    const [v350] = await t.db.select().from(gear).where(eq(gear.id, ids.v350!));
    expect(v350).toMatchObject({
      assignedRigId: ids.rig6,
      assignedPersonId: p1,
      slot: 'container',
    });
    expect(report.dateDifferences).toHaveLength(1);
    expect(report.dateDifferences[0]).toMatch(/77917.*2010-01-01.*2011-01-01/);
    expect(six.components.main).toMatchObject({ name: 'Storm 190', serialNumber: null });
    expect(six.components.reserve).toMatchObject({ name: 'PR 176', serialNumber: '64447' });
    expect(six.components.aad).toMatchObject({
      name: 'Vigil Cuatro',
      type: 'AAD',
      serialNumber: '62715',
      dateOfManufacture: '2019-05-01',
    });
    const sixGear = await t.db.select().from(gear).where(eq(gear.assignedRigId, ids.rig6!));
    expect(sixGear.every((g) => g.assignedPersonId === p1)).toBe(true);

    // Rig 10: the AAD already on the rig, matched ignoring case, goes into the slot.
    const ten = await rigApi('10');
    expect(ten.components.aad).toMatchObject({ id: ids.cypres, type: 'AAD' });
    expect(ten.components.container).toMatchObject({ name: 'V353', serialNumber: '82818' });

    // 12376: rig 11 (first by number) gets it; rig 12 keeps its text in a custom field.
    expect((await rigApi('11')).components.container).toMatchObject({ id: ids.i6 });
    const twelve = await rigApi('12');
    expect(twelve.components).toMatchObject({ container: null, reserve: null, aad: null });
    expect(twelve.components.main).toMatchObject({ name: 'Pilot 188' });
    expect(twelve.customFields).toEqual({ 'Unplaced container': 'N/A #12376' });
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatch(/Rig #12 container.*12376.*Rig #11/);

    // Rigs with only a main get a new main.
    for (const [n, name] of [
      ['4', 'Storm 150'],
      ['7', 'Storm 170'],
      ['9', 'Storm 190'],
    ])
      expect((await rigApi(n!)).components.main).toMatchObject({ name, type: 'Main' });
    expect((await rigApi('8')).components.main).toMatchObject({
      name: 'Storm 170',
      serialNumber: 'TF-170 00382',
    });

    // Types: trimmed and unified; Riser/Risers only suggested.
    const types = [...new Set((await allGear()).map((g) => g.type))].sort();
    expect(types).toEqual([
      'AAD',
      'Container',
      'Cutaway handle',
      'Dbag',
      'Free bag',
      'Main',
      'Pilot chute',
      'Reserve',
      'Reserve handle',
      'Riser',
      'Risers',
    ]);
    expect(report.typesNormalised).toEqual(
      expect.arrayContaining([
        "'Aad' → 'AAD' (1)",
        "'Container ' → 'Container' (1)",
        "'Reserve ' → 'Reserve' (1)",
        "'Pilot chute ' → 'Pilot chute' (1)",
        "'Pilot Chute' → 'Pilot chute' (1)",
      ]),
    );
    expect(report.suggestions.join()).toMatch(/Riser.*Risers/);

    // Second run: nothing to do.
    const gearAfter = await allGear();
    const rigsAfter = await allRigs();
    const again = await moveRigComponents({ db: t.db, apply: true, ...quiet });
    expect(again).toMatchObject({ matched: 0, created: 0, datesFilled: 0, typesNormalised: [] });
    expect(again.alreadyDone).toBe(20);
    expect(await allGear()).toEqual(gearAfter);
    expect(await allRigs()).toEqual(rigsAfter);
  });

  it('a component the app already placed is left alone', async () => {
    const placed = (
      await as(user)
        .post('/api/gear', { name: 'Storm 150 (new)', assignedRigId: ids.rig4, slot: 'main' })
        .expect(201)
    ).body;
    const report = await moveRigComponents({ db: t.db, apply: true, ...quiet });
    expect(report.alreadyDone).toBe(1);
    expect((await rigApi('4')).components.main.id).toBe(placed.id);
  });
});

describe('activity log', () => {
  it('records one summary entry when it applies, and none on a dry run or a re-run', async () => {
    const { auditLog } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const entries = () =>
      t.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.resourceName, 'Rig components moved into gear'));
    await resetDb(t);
    await seed();
    await moveRigComponents({ db: t.db, apply: false, log: () => {} });
    expect(await entries()).toHaveLength(0);
    await moveRigComponents({ db: t.db, apply: true, log: () => {} });
    const [entry] = await entries();
    expect(entry).toMatchObject({ action: 'UPDATE', resource: 'rigs', resourceId: 'all' });
    expect(entry!.details).toMatchObject({ via: 'command line' });
    await moveRigComponents({ db: t.db, apply: true, log: () => {} });
    expect(await entries()).toHaveLength(1);
  });
});

describe('spreadsheet leftovers', () => {
  it("drops empty 'Reserve Serial Number' and a 'Primary User' that repeats the primary person", async () => {
    await resetDb(t);
    const pat = await createPerson(t, { firstName: 'Pat' });
    const [rig] = await t.db
      .insert(rigs)
      .values({
        number: '30',
        name: 'rig-30',
        primaryUserId: pat.id,
        customFields: {
          'Reserve Serial Number': null,
          'Primary User': 'pat',
          'Past name': 'VECTOR 30',
        },
      })
      .returning();
    const [other] = await t.db
      .insert(rigs)
      .values({
        number: '31',
        name: 'rig-31',
        primaryUserId: pat.id,
        customFields: { 'Primary User': 'Sam' },
      })
      .returning();
    await moveRigComponents({ db: t.db, apply: true, log: () => {} });
    const [after] = await t.db.select().from(rigs).where(eq(rigs.id, rig!.id));
    expect(after!.customFields).toEqual({ 'Past name': 'VECTOR 30' });
    const [kept] = await t.db.select().from(rigs).where(eq(rigs.id, other!.id));
    expect(kept!.customFields).toEqual({ 'Primary User': 'Sam' });
  });
});
