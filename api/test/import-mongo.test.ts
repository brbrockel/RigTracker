import { asc, eq } from 'drizzle-orm';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, newToken } from '../src/auth/tokens.js';
import {
  auditLog,
  events,
  gear,
  media,
  people,
  rigs,
  sessions,
  signInLinks,
} from '../src/db/schema.js';
import { importMongo, type ImportReport } from '../src/scripts/import-mongo.js';
import { SESSION_COOKIE, createTestApp, nextIp, resetDb, type TestApp } from './helpers.js';

const MONGO_URI = process.env.TEST_MONGO_URI!;
if (!/test/.test(new URL(MONGO_URI).pathname))
  throw new Error(`Refusing to use a non-test Mongo database: ${MONGO_URI}`);

let t: TestApp;
let mongo: MongoClient;
const id = () => new ObjectId();
const DAY = 24 * 3600_000;

// A small but realistic 2.0.0-alpha.2 database.
const admin = id();
const jane = id();
const noRoles = id();
const oldUserId = id();
const rig = id();
const onRig = id();
const blankPerson = id();
const lostPerson = id();
const event = id();
const liveSession = id();
const sessionToken = newToken();
const linkToken = newToken();
const auditEntry = id();
const auditByOldUser = id();

async function seed() {
  const db = mongo.db();
  await db.dropDatabase();
  await db.collection('people').insertMany([
    {
      _id: admin,
      firstName: 'Ada',
      lastName: 'Admin',
      email: 'ada@example.com',
      roles: ['admin'],
      isActive: true,
      loginCount: 7,
      lastLoginAt: new Date('2026-10-01T12:00:00Z'),
      lastLoginIp: '10.0.0.1',
      legacyUserId: oldUserId.toHexString(),
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T12:00:00Z'),
      __v: 0,
    },
    {
      _id: jane,
      firstName: 'Jane',
      lastName: 'Jumper',
      email: 'jane@example.com',
      phone: '+14155552671',
      address: { city: 'Storrs', state: 'CT' },
      dob: new Date('1999-04-05T00:00:00Z'),
      emergencyContacts: [{ name: 'Mom', phone: '+14155552672' }],
      roles: ['user'],
    },
    // From the spreadsheet: no roles, a placeholder DOB.
    { _id: noRoles, firstName: 'Sam', lastName: 'Sheet', roles: [], dob: new Date('1900-01-01') },
  ]);
  await db.collection('users_merged').insertOne({ email: 'old@example.com' });
  await db.collection('rigs').insertOne({
    _id: rig,
    name: 'Javelin',
    number: 7,
    containerDOM: new Date('2015-06-01T00:00:00Z'),
    repackDue: new Date('1900-01-01T00:00:00Z'),
    lastPacked: new Date('2026-04-01T00:00:00Z'),
    primaryUserId: jane, // stored as an ObjectId by the old spreadsheet import
    customFields: { color: 'blue' },
    pastNaming: 'Old name',
  });
  await db.collection('gear').insertMany([
    {
      _id: onRig,
      name: 'Cypres',
      serialNumber: 'C-123',
      dateOfManufacture: new Date('2018-02-01T00:00:00Z'),
      assignedRigId: rig.toHexString(),
      assignedPersonId: jane.toHexString(),
    },
    { _id: blankPerson, name: 'Altimeter', assignedPersonId: '', serialNumber: '' },
    { _id: lostPerson, name: 'Helmet', assignedPersonId: id().toHexString() },
  ]);
  await db.collection('events').insertOne({
    _id: event,
    name: 'Boogie',
    eventDate: new Date('2026-07-04T00:00:00Z'),
    eventPhotoUrl: '/uploads/events/a.jpg',
    photoUrls: ['/uploads/events/a.jpg'],
  });
  await db.collection('sessions').insertMany([
    {
      _id: liveSession,
      sessionId: hashToken(sessionToken),
      userId: admin,
      expiresAt: new Date(Date.now() + 10 * DAY),
      csrfToken: 'csrf-token-from-mongo-000000000000000000000',
      ip: '10.0.0.1',
    },
    {
      sessionId: hashToken(newToken()),
      userId: admin,
      expiresAt: new Date(Date.now() + DAY),
      revokedAt: new Date(),
    },
    { sessionId: hashToken(newToken()), userId: jane, expiresAt: new Date(Date.now() - DAY) },
  ]);
  await db.collection('sign_in_links').insertMany([
    { tokenHash: hashToken(linkToken), userId: jane, expiresAt: new Date(Date.now() + DAY) },
    {
      tokenHash: hashToken(newToken()),
      userId: jane,
      expiresAt: new Date(Date.now() + DAY),
      usedAt: new Date(),
    },
  ]);
  await db.collection('audit_logs').insertMany([
    {
      _id: auditEntry,
      action: 'UPDATE',
      resource: 'rigs',
      resourceId: rig.toHexString(),
      resourceName: 'Javelin',
      userId: admin.toHexString(),
      userEmail: 'ada@example.com',
      userDisplayName: 'Ada Admin',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    },
    {
      _id: auditByOldUser,
      action: 'DELETE',
      resource: 'events',
      resourceId: 'deadbeefdeadbeefdeadbeef',
      userId: id().toHexString(),
      userEmail: 'gone@example.com',
      details: { purgeMedia: false },
      createdAt: new Date('2025-01-01T00:00:00Z'),
    },
  ]);
}

const run = (apply: boolean) =>
  importMongo({
    mongoUri: MONGO_URI,
    databaseUrl: process.env.DATABASE_URL!,
    apply,
    log: () => {},
  });
const byCollection = (r: ImportReport) =>
  Object.fromEntries(r.collections.map((c) => [c.collection, c]));

beforeAll(async () => {
  t = await createTestApp();
  await resetDb(t);
  mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  await seed();
});
afterAll(async () => {
  await mongo.db().dropDatabase();
  await mongo.close();
  await resetDb(t);
  await t.close();
});

describe('import-mongo', () => {
  it('a dry run reports what it would do and writes nothing', async () => {
    const report = await run(false);
    expect(report).toMatchObject({ applied: false, ok: true, conflicts: [] });
    const c = byCollection(report);
    expect(c.people).toMatchObject({ mongo: 3, toImport: 3, postgres: 0, nulledDates: 1 });
    expect(c.rigs).toMatchObject({ mongo: 1, toImport: 1, nulledDates: 1, nulledRefs: 0 });
    expect(c.gear).toMatchObject({ mongo: 3, toImport: 3, nulledRefs: 1 });
    expect(c.sessions).toMatchObject({ mongo: 3, toImport: 1 });
    expect(c.sign_in_links).toMatchObject({ mongo: 2, toImport: 1 });
    expect(c.audit_logs).toMatchObject({ mongo: 2, toImport: 2 });
    // pastNaming has no column but is kept, as customFields['Past name'].
    expect(report.unknownFields).toEqual({});
    expect(report.notes.join('\n')).toMatch(/person [0-9a-f]{24} not found/);
    expect(await t.db.select().from(people)).toEqual([]);
  });

  it('--apply imports everything, mapping ids and clearing placeholder dates and lost references', async () => {
    const report = await run(true);
    expect(report).toMatchObject({ applied: true, ok: true });
    for (const c of report.collections) expect(c.postgres, c.collection).toBe(c.toImport);

    const ps = await t.db.select().from(people).orderBy(asc(people.firstName));
    expect(ps.map((p) => [p.firstName, p.role, p.legacyId])).toEqual([
      ['Ada', 'admin', admin.toHexString()],
      ['Jane', 'user', jane.toHexString()],
      ['Sam', null, noRoles.toHexString()],
    ]);
    const [ada, janeRow, sam] = ps;
    expect(ada).toMatchObject({ loginCount: 7, lastLoginIp: '10.0.0.1', isActive: true });
    expect(ada!.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(janeRow).toMatchObject({
      dob: '1999-04-05',
      address: { city: 'Storrs', state: 'CT' },
      emergencyContacts: [{ name: 'Mom', phone: '+14155552672' }],
    });
    expect(sam!.dob).toBeNull();

    const [r] = await t.db.select().from(rigs);
    expect(r).toMatchObject({
      name: 'Javelin',
      number: '7',
      containerDOM: '2015-06-01',
      lastPacked: '2026-04-01',
      repackDue: null,
      primaryUserId: janeRow!.id,
      customFields: { color: 'blue', 'Past name': 'Old name' },
      legacyId: rig.toHexString(),
    });

    const g = await t.db.select().from(gear).orderBy(asc(gear.name));
    expect(g.map((x) => [x.name, x.serialNumber, x.assignedRigId, x.assignedPersonId])).toEqual([
      ['Altimeter', null, null, null],
      ['Cypres', 'C-123', r!.id, janeRow!.id],
      ['Helmet', null, null, null],
    ]);
    expect(g[1]!.dateOfManufacture).toBe('2018-02-01');

    const [ev] = await t.db.select().from(events);
    expect(ev).toMatchObject({ eventDate: '2026-07-04', photoUrls: ['/uploads/events/a.jpg'] });
    // Its photo becomes a media row, as migration 0004 did for data already in Postgres.
    expect(
      (await t.db.select().from(media)).map((m) => [m.ownerType, m.ownerId, m.url, m.position]),
    ).toEqual([['event', ev!.id, '/uploads/events/a.jpg', 0]]);

    const ss = await t.db.select().from(sessions);
    expect(ss).toHaveLength(1);
    expect(ss[0]).toMatchObject({ personId: ada!.id, tokenHash: hashToken(sessionToken) });
    const links = await t.db.select().from(signInLinks);
    expect(links).toEqual([expect.objectContaining({ personId: janeRow!.id, usedAt: null })]);

    const audit = await t.db.select().from(auditLog).orderBy(asc(auditLog.createdAt));
    expect(audit[0]).toMatchObject({
      action: 'DELETE',
      resourceId: 'deadbeefdeadbeefdeadbeef', // not an imported record: kept as it was
      userId: null,
      userEmail: 'gone@example.com',
      details: { purgeMedia: false, legacyUserId: expect.stringMatching(/^[0-9a-f]{24}$/) },
    });
    expect(audit[1]).toMatchObject({
      action: 'UPDATE',
      resourceId: r!.id,
      userId: ada!.id,
      userDisplayName: 'Ada Admin',
    });
    expect(audit[1]!.createdAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('imported sessions and links keep working in the app', async () => {
    const me = await request(t.app.getHttpServer())
      .get('/api/auth/me')
      .set('CF-Connecting-IP', nextIp())
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      authenticated: true,
      user: { email: 'ada@example.com', roles: ['admin'] },
      csrfToken: 'csrf-token-from-mongo-000000000000000000000',
    });
    await request(t.app.getHttpServer())
      .post('/api/auth/link/check')
      .set('CF-Connecting-IP', nextIp())
      .send({ token: linkToken })
      .expect(201, { email: 'jane@example.com', displayName: 'Jane Jumper' });
  });

  it('re-running updates the same rows (no duplicates) and leaves imported audit entries alone', async () => {
    await mongo
      .db()
      .collection('rigs')
      .updateOne({ _id: rig }, { $set: { name: 'Javelin II' } });
    const [audit1] = await t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.legacyId, auditEntry.toHexString()));
    const report = await run(true);
    expect(report).toMatchObject({ applied: true, ok: true });
    const c = byCollection(report);
    expect(c.people!.postgres).toBe(3);
    expect(await t.db.select().from(people)).toHaveLength(3);
    expect(await t.db.select().from(gear)).toHaveLength(3);
    expect(await t.db.select().from(sessions)).toHaveLength(1);
    expect(await t.db.select().from(signInLinks)).toHaveLength(1);
    expect(await t.db.select().from(media)).toHaveLength(1);
    const allAudit = await t.db.select().from(auditLog);
    expect(allAudit.filter((a) => a.legacyId)).toHaveLength(2);
    expect(allAudit.find((a) => a.legacyId === auditEntry.toHexString())).toEqual(audit1);
    const [r] = await t.db.select().from(rigs);
    expect(r!.name).toBe('Javelin II');
  });

  it('refuses to import conflicts the database would reject, and writes nothing', async () => {
    await mongo
      .db()
      .collection('people')
      .insertOne({ firstName: 'Dup', email: 'ADA@example.com', roles: ['viewer'] });
    await mongo.db().collection('gear').insertOne({ name: 'Copy', serialNumber: 'C-123' });
    const report = await run(true);
    expect(report).toMatchObject({ applied: false, ok: false });
    expect(report.conflicts).toHaveLength(2);
    expect(report.conflicts.join('\n')).toMatch(/ada@example.com/);
    expect(report.conflicts.join('\n')).toMatch(/C-123/);
    expect(await t.db.select().from(people)).toHaveLength(3);
  });
});
