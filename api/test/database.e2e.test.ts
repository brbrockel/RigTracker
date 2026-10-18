import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, runMigrations } from '../src/db/migrate.js';
import { auditLog, gear, people, rigs } from '../src/db/schema.js';
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

/** The Postgres error code a failed statement gave (drizzle wraps it as `cause`). */
async function pgCode(run: Promise<unknown>): Promise<string | undefined> {
  try {
    await run;
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

describe('the audit log is append-only', () => {
  it('UPDATE and DELETE on audit_log are refused by the database; INSERT and TRUNCATE work', async () => {
    await as(user).post('/api/rigs', { name: 'Audited' }).expect(201);
    const before = await t.db.select().from(auditLog);
    expect(before.length).toBeGreaterThan(0);

    await expect(
      t.db.execute(sql`update audit_log set resource_name = 'tampered'`),
    ).rejects.toThrow();
    await expect(t.db.execute(sql`delete from audit_log`)).rejects.toThrow();
    const err = await pgCode(t.db.execute(sql`delete from audit_log`));
    expect(err).toBe('P0001'); // raised by the trigger
    expect(await t.db.select().from(auditLog)).toEqual(before);

    await t.db.insert(auditLog).values({ action: 'CREATE', resource: 'rigs', resourceId: 'x' });
    expect(await t.db.select().from(auditLog)).toHaveLength(before.length + 1);
    // TRUNCATE is a table operation, not a row UPDATE/DELETE: the tests rely on it.
    await t.db.execute(sql`truncate audit_log`);
    expect(await t.db.select().from(auditLog)).toHaveLength(0);
  });
});

describe('foreign keys', () => {
  it('gear and rigs cannot point at records that do not exist', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    expect(await pgCode(t.db.insert(gear).values({ name: 'x', assignedRigId: missing }))).toBe(
      '23503',
    );
    expect(await pgCode(t.db.insert(gear).values({ name: 'x', assignedPersonId: missing }))).toBe(
      '23503',
    );
    expect(await pgCode(t.db.insert(rigs).values({ name: 'x', primaryUserId: missing }))).toBe(
      '23503',
    );
  });

  it('deleting a rig in the database clears gear.rig_id; the API also clears their person', async () => {
    const p = await createPerson(t);
    const viaSql = (await as(user).post('/api/rigs', { primaryUserId: p.id }).expect(201)).body;
    const g1 = (await as(user).post('/api/gear', { assignedRigId: viaSql.id }).expect(201)).body;
    await t.db.delete(rigs).where(eq(rigs.id, viaSql.id));
    const [row1] = await t.db.select().from(gear).where(eq(gear.id, g1.id));
    expect(row1).toMatchObject({ assignedRigId: null, assignedPersonId: p.id });

    const viaApi = (await as(user).post('/api/rigs', { primaryUserId: p.id }).expect(201)).body;
    const g2 = (await as(user).post('/api/gear', { assignedRigId: viaApi.id }).expect(201)).body;
    await as(admin).delete(`/api/rigs/${viaApi.id}`).expect(200);
    const [row2] = await t.db.select().from(gear).where(eq(gear.id, g2.id));
    expect(row2).toMatchObject({ assignedRigId: null, assignedPersonId: null });
  });

  it('deleting a person clears rigs.primary_person_id and gear.person_id, and their sessions', async () => {
    const p = await signInAs(t, 'viewer');
    const rig = (await as(user).post('/api/rigs', { primaryUserId: p.id }).expect(201)).body;
    const onRig = (await as(user).post('/api/gear', { assignedRigId: rig.id }).expect(201)).body;
    const direct = (await as(user).post('/api/gear', { assignedPersonId: p.id }).expect(201)).body;
    await t.db.delete(people).where(eq(people.id, p.id));
    const [r] = await t.db.select().from(rigs).where(eq(rigs.id, rig.id));
    expect(r!.primaryUserId).toBeNull();
    const rows = await t.db.select().from(gear);
    expect(rows.find((g) => g.id === onRig.id)).toMatchObject({
      assignedRigId: rig.id,
      assignedPersonId: null,
    });
    expect(rows.find((g) => g.id === direct.id)!.assignedPersonId).toBeNull();
    const { rows: left } = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from sessions where person_id = ${p.id}`,
    );
    expect(left[0]!.n).toBe(0);
    await as(p).get('/api/rigs').expect(401);
  });
});

describe('unique constraints', () => {
  it('sign-in emails are unique among people with a role (any case), by a partial index', async () => {
    await t.db.insert(people).values({ email: 'Shared@Example.com', role: 'user' });
    // People without a role can share it.
    await t.db.insert(people).values({ email: 'shared@example.com' });
    await t.db.insert(people).values({ email: 'SHARED@example.com' });
    expect(
      await pgCode(t.db.insert(people).values({ email: 'shared@EXAMPLE.com', role: 'viewer' })),
    ).toBe('23505');

    // Through the API the clash is a 409 with a clear message, for access and for edits.
    const [noRole] = await t.db.select().from(people).where(eq(people.email, 'SHARED@example.com'));
    const res = await as(admin)
      .patch(`/api/auth/people/${noRole!.id}/access`, { role: 'user' })
      .expect(409);
    expect(res.body.message).toBe('Another person who signs in already uses that email');
    const signsIn = await createPerson(t, { roles: ['user'], email: 'other@example.com' });
    const edit = await as(user)
      .put(`/api/people/${signsIn.id}`, { email: 'shared@example.com' })
      .expect(409);
    expect(edit.body.message).toBe('Another person who signs in already uses that email');
  });

  it('the role must be admin, user or viewer', async () => {
    expect(
      await pgCode(t.db.execute(sql`insert into people (email, role) values ('x@y.z', 'owner')`)),
    ).toBe('23514');
  });

  it('serial numbers are unique, but any number of gear can have none (NULL)', async () => {
    await t.db
      .insert(gear)
      .values([{ name: 'a' }, { name: 'b' }, { name: 'c', serialNumber: null }]);
    await t.db.insert(gear).values({ name: 'd', serialNumber: 'SN-1' });
    expect(await pgCode(t.db.insert(gear).values({ name: 'e', serialNumber: 'SN-1' }))).toBe(
      '23505',
    );
    const rows = await t.db.select().from(gear);
    expect(rows.filter((g) => g.serialNumber === null)).toHaveLength(3);
  });
});

describe('stored and returned values', () => {
  it('ids are UUIDs, date-only fields are yyyy-mm-dd and timestamps are ISO strings', async () => {
    const rig = (
      await as(user)
        .post('/api/rigs', { name: 'R', repackDue: '2026-03-01', lastPacked: '2025-09-01' })
        .expect(201)
    ).body;
    expect(rig.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(rig).not.toHaveProperty('_id');
    expect(rig).not.toHaveProperty('legacyId');
    expect(rig.repackDue).toBe('2026-03-01');
    expect(rig.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const person = (await as(user).post('/api/people', { dob: '1990-02-03' }).expect(201)).body;
    expect(person.dob).toBe('1990-02-03');
    const me = (await as(user).get('/api/auth/me').expect(200)).body;
    expect(me.sessionExpiresAt).toMatch(/Z$/);
    expect(me.user.lastLoginAt).toMatch(/Z$/);
    await as(user).post('/api/people', { dob: 'not a date' }).expect(400);
  });

  it('a malformed id says that ids are UUIDs', async () => {
    const res = await as(user).get('/api/rigs/0123456789abcdef01234567').expect(400);
    expect(res.body.message).toMatch(/UUID/);
    const ref = await as(user).post('/api/gear', { assignedRigId: '0123456789abcdef01234567' });
    expect(ref.status).toBe(400);
    expect(ref.body.message).toMatch(/assignedRigId.*UUID/);
    await as(user).get('/api/gear?rigId=not-a-uuid').expect(400);
  });
});

describe('migrations', () => {
  it('apply to an empty database, and a second run changes nothing', async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const name = `rigtracker_test_migrations_${process.pid}`;
    const admin = new URL(url);
    admin.pathname = '/postgres';
    const client = new pg.Client({ connectionString: admin.toString() });
    await client.connect();
    try {
      await client.query(`drop database if exists "${name}" with (force)`);
      await client.query(`create database "${name}"`);
      const target = new URL(url);
      target.pathname = `/${name}`;
      await runMigrations(target.toString());
      await runMigrations(target.toString());
      const check = new pg.Client({ connectionString: target.toString() });
      await check.connect();
      try {
        const { rows: tables } = await check.query<{ table_name: string }>(
          `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
        );
        expect(tables.map((r) => r.table_name)).toEqual([
          'audit_log',
          'events',
          'gear',
          'media',
          'people',
          'rigs',
          'sessions',
          'sign_in_links',
        ]);
        const { rows: triggers } = await check.query(
          `select tgname from pg_trigger where tgrelid = 'audit_log'::regclass and not tgisinternal`,
        );
        expect(triggers).toEqual([{ tgname: 'audit_log_no_update_delete' }]);
        const { rows: applied } = await check.query(
          'select count(*)::int as n from drizzle.__drizzle_migrations',
        );
        expect(applied[0].n).toBe(6);
      } finally {
        await check.end();
      }
    } finally {
      await client.query(`drop database if exists "${name}" with (force)`);
      await client.end();
    }
  });
});

describe('migration 0004: photo URL columns into media', () => {
  /** A fresh database migrated up to (not including) 0003, as production was before. */
  async function databaseAtAlpha4(name: string) {
    const url = new URL(process.env.DATABASE_URL!);
    const admin = new URL(url);
    admin.pathname = '/postgres';
    const client = new pg.Client({ connectionString: admin.toString() });
    await client.connect();
    await client.query(`drop database if exists "${name}" with (force)`);
    await client.query(`create database "${name}"`);
    const target = new URL(url);
    target.pathname = `/${name}`;
    // The migrations as they were in 2.0.0-alpha.4: the first three, and a journal of them.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rigtracker-migrations-'));
    fs.mkdirSync(path.join(dir, 'meta'));
    const journal = JSON.parse(
      fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
    );
    journal.entries = journal.entries.slice(0, 3);
    fs.writeFileSync(path.join(dir, 'meta', '_journal.json'), JSON.stringify(journal));
    for (const e of journal.entries)
      fs.copyFileSync(path.join(MIGRATIONS_DIR, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
    const pool = new pg.Pool({ connectionString: target.toString() });
    await migrate(drizzle(pool), { migrationsFolder: dir });
    fs.rmSync(dir, { recursive: true, force: true });
    return {
      url: target.toString(),
      pool,
      async drop() {
        await pool.end();
        await client.query(`drop database if exists "${name}" with (force)`);
        await client.end();
      },
    };
  }

  it('copies rig, gear and event photos into media, in order, at start-up', async () => {
    const db = await databaseAtAlpha4(`rigtracker_test_media_move_${process.pid}`);
    try {
      const q = (text: string, values: unknown[] = []) => db.pool.query(text, values);
      const id = async (text: string, values: unknown[]) => (await q(text, values)).rows[0].id;
      const rigPhoto = await id(
        `insert into rigs (name, image_url) values ('A', $1) returning id`,
        ['/uploads/rigs/a.jpg'],
      );
      const rigVideo = await id(
        `insert into rigs (name, image_url) values ('B', $1) returning id`,
        ['https://example.com/clip.MP4?x=1'],
      );
      await q(`insert into rigs (name, image_url) values ('Blank', ''), ('None', null),
        ('Bad', 'javascript:alert(1)'), ('Http', 'http://example.com/a.jpg')`);
      const relative = await id(
        `insert into gear (name, image_url) values ('G', $1) returning id`,
        [' uploads/gear/g.png '],
      );
      const event = await id(
        `insert into events (name, event_photo_url, photo_urls) values ('E', $1, $2) returning id`,
        [
          '/uploads/events/main.jpg',
          ['/uploads/events/1.jpg', '/uploads/events/main.jpg', '', '/uploads/events/2.mov'],
        ],
      );
      const noMain = await id(
        `insert into events (name, event_photo_url, photo_urls) values ('F', '', $1) returning id`,
        [['/uploads/events/x.webm', '/uploads/events/y.jpg', '/uploads/events/x.webm']],
      );
      await q(`insert into events (name) values ('Empty')`);

      await runMigrations(db.url);

      const { rows } = await q(
        `select owner_type, owner_id, url, kind, position, caption from media
         order by owner_type, owner_id, position`,
      );
      const of = (ownerId: string) =>
        rows
          .filter((r) => r.owner_id === ownerId)
          .map((r) => [r.owner_type, r.url, r.kind, r.position]);
      expect(rows).toHaveLength(8);
      expect(of(rigPhoto)).toEqual([['rig', '/uploads/rigs/a.jpg', 'photo', 0]]);
      expect(of(rigVideo)).toEqual([['rig', 'https://example.com/clip.MP4?x=1', 'video', 0]]);
      expect(of(relative)).toEqual([['gear', '/uploads/gear/g.png', 'photo', 0]]);
      expect(of(event)).toEqual([
        ['event', '/uploads/events/main.jpg', 'photo', 0],
        ['event', '/uploads/events/1.jpg', 'photo', 1],
        ['event', '/uploads/events/2.mov', 'video', 2],
      ]);
      expect(of(noMain)).toEqual([
        ['event', '/uploads/events/x.webm', 'video', 0],
        ['event', '/uploads/events/y.jpg', 'photo', 1],
      ]);
      expect(rows.every((r) => r.caption === null)).toBe(true);
      // Migration 0005 then drops the 1.x photo and rig component columns.
      const { rows: cols } = await q(
        `select table_name, column_name from information_schema.columns
         where table_name in ('rigs', 'gear', 'events')
           and column_name in ('image_url', 'event_photo_url', 'photo_urls', 'container', 'main_size', 'aad_serial_number')`,
      );
      expect(cols).toEqual([]);
    } finally {
      await db.drop();
    }
  });
});
