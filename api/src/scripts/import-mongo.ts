/**
 * One-shot import of the 1.x/alpha MongoDB data into Postgres. Safe to re-run: every row keeps
 * its Mongo ObjectId in legacy_id, and a re-run updates those rows instead of adding new ones
 * (audit entries, being append-only, are only ever added).
 *
 *   node dist/scripts/import-mongo.js           dry run: what it would do, with counts
 *   node dist/scripts/import-mongo.js --apply   writes everything in one transaction
 *
 * Reads MONGO_URI (or MONGO_URI_FILE) and DATABASE_URL (or DATABASE_URL_FILE).
 *
 * - people: roles[0] becomes the role (users_merged is ignored);
 * - rigs, gear, events; sessions that aren't revoked or expired; unused, unexpired sign-in links;
 * - audit_logs → audit_log, with ids of imported records mapped to their new UUIDs (other ids
 *   are kept as they are; an unknown actor id is kept in details.legacyUserId).
 * Every ObjectId reference becomes the new UUID. Dates before 1950 (blanks from the old
 * spreadsheet import), empty-string ids and references to missing records become NULL and are
 * counted. Conflicts the database would refuse (two people who sign in with one email, a
 * duplicate serial number, notes over 1000 characters) are reported and nothing is written.
 * After --apply it compares Mongo and Postgres counts and exits non-zero on a mismatch.
 */
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName, inArray, sql } from 'drizzle-orm';
import { MongoClient, ObjectId, type Document } from 'mongodb';
import { readSecret } from '../common/secrets.js';
import { loadConfig } from '../config.js';
import { createDb, createPool, type Database } from '../db/db.js';
import {
  auditLog,
  events,
  gear,
  people,
  rigs,
  sessions,
  signInLinks,
  type Address,
  type CustomFields,
} from '../db/schema.js';

const ROLES = new Set(['admin', 'user', 'viewer']);
/** Dates before this are blanks from the spreadsheet import. */
const EARLIEST_YEAR = 1950;
const HASH = /^[a-f0-9]{64}$/;
const BATCH = 500;

const KNOWN_FIELDS: Record<string, string[]> = {
  people: [
    'firstName',
    'middleName',
    'lastName',
    'email',
    'phone',
    'address',
    'dob',
    'emergencyContacts',
    'customFields',
    'roles',
    'isActive',
    'lastLoginAt',
    'loginCount',
    'lastLoginIp',
    'lastUserAgent',
    'legacyUserId',
  ],
  rigs: [
    'name',
    'number',
    'container',
    'containerSerialNumber',
    'containerDOM',
    'mainSize',
    'mainDOM',
    'mainSerialNumber',
    'reserveSize',
    'reserveDOM',
    'reserveSerialNumber',
    'lastPacked',
    'riggerINT',
    'repackDue',
    'aadType',
    'aadDOM',
    'aadSerialNumber',
    'customFields',
    'primaryUserId',
    'notes',
    'imageUrl',
    // Kept as customFields['Past name'].
    'pastNaming',
  ],
  gear: [
    'serialNumber',
    'name',
    'type',
    'dateOfManufacture',
    'notes',
    'imageUrl',
    'assignedRigId',
    'assignedPersonId',
  ],
  events: ['name', 'eventDate', 'description', 'eventPhotoUrl', 'photoUrls'],
  sessions: ['sessionId', 'userId', 'expiresAt', 'revokedAt', 'csrfToken', 'ip', 'userAgent'],
  sign_in_links: ['tokenHash', 'userId', 'expiresAt', 'usedAt', 'createdByEmail'],
  audit_logs: [
    'action',
    'resource',
    'resourceId',
    'resourceName',
    'userId',
    'userEmail',
    'userDisplayName',
    'details',
  ],
};
const ALWAYS_KNOWN = new Set(['_id', '__v', 'createdAt', 'updatedAt']);

export interface CollectionReport {
  collection: string;
  table: string;
  /** Documents in Mongo. */
  mongo: number;
  /** Of those, the ones to import (sessions and links: still usable). */
  toImport: number;
  /** Rows in Postgres with one of those legacy ids (after --apply: should equal toImport). */
  postgres: number;
  nulledDates: number;
  nulledRefs: number;
}

export interface ImportReport {
  applied: boolean;
  /** No conflicts, and (after --apply) the counts match. */
  ok: boolean;
  collections: CollectionReport[];
  /** Things that stop the import (nothing is written while there are any). */
  conflicts: string[];
  /** References to missing records, skipped documents and other notes. */
  notes: string[];
  /** Fields present in Mongo that have no column, per collection: not imported. */
  unknownFields: Record<string, Record<string, number>>;
}

export interface ImportOptions {
  mongoUri: string;
  databaseUrl: string;
  apply: boolean;
  log?: (line: string) => void;
}

// ── Value conversions ───────────────────────────────────────────────────────

/** An ObjectId reference as a hex string; '' and missing are null. */
function refOf(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof ObjectId) return v.toHexString();
  const s = String(v).trim();
  return s || null;
}

function textOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v === '' ? null : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

function timestampOf(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

interface Counters {
  nulledDates: number;
  nulledRefs: number;
}

/** A date-only value as yyyy-mm-dd (its UTC date); before 1950 or unreadable is null (counted). */
function dayOf(v: unknown, c: Counters): string | null {
  if (v == null || v === '') return null;
  const d = timestampOf(v);
  if (!d || d.getUTCFullYear() < EARLIEST_YEAR) {
    c.nulledDates++;
    return null;
  }
  return d.toISOString().slice(0, 10);
}

// ── The plan ────────────────────────────────────────────────────────────────

interface Planned<Row> {
  collection: string;
  mongo: number;
  rows: Array<{ legacyId: string; row: Row }>;
  counters: Counters;
}

type PersonRow = Omit<typeof people.$inferInsert, 'id'>;
type RigRow = Omit<typeof rigs.$inferInsert, 'id' | 'primaryUserId'> & {
  primaryRef: string | null;
};
type GearRow = Omit<typeof gear.$inferInsert, 'id' | 'assignedRigId' | 'assignedPersonId'> & {
  rigRef: string | null;
  personRef: string | null;
};
type EventRow = Omit<typeof events.$inferInsert, 'id'>;
type SessionRow = Omit<typeof sessions.$inferInsert, 'id' | 'personId'> & { personRef: string };
type LinkRow = Omit<typeof signInLinks.$inferInsert, 'id' | 'personId'> & { personRef: string };
type AuditRow = Omit<typeof auditLog.$inferInsert, 'id' | 'userId'> & {
  actorRef: string | null;
};

async function readAll(client: MongoClient, name: string): Promise<Document[]> {
  return client.db().collection(name).find({}).toArray();
}

function noteUnknownFields(report: ImportReport, collection: string, docs: Document[]) {
  const known = new Set(KNOWN_FIELDS[collection]);
  const counts: Record<string, number> = {};
  for (const doc of docs)
    for (const key of Object.keys(doc))
      if (!known.has(key) && !ALWAYS_KNOWN.has(key)) counts[key] = (counts[key] ?? 0) + 1;
  if (Object.keys(counts).length) report.unknownFields[collection] = counts;
}

/** Reads Mongo and works out every row to write, with references still as ObjectId strings. */
async function plan(client: MongoClient, report: ImportReport, now: Date) {
  const raw = {
    people: await readAll(client, 'people'),
    rigs: await readAll(client, 'rigs'),
    gear: await readAll(client, 'gear'),
    events: await readAll(client, 'events'),
    sessions: await readAll(client, 'sessions'),
    sign_in_links: await readAll(client, 'sign_in_links'),
    audit_logs: await readAll(client, 'audit_logs'),
  };
  for (const [name, docs] of Object.entries(raw)) noteUnknownFields(report, name, docs);
  const counters = (): Counters => ({ nulledDates: 0, nulledRefs: 0 });
  const created = (d: Document) => timestampOf(d.createdAt) ?? now;
  const updated = (d: Document) => timestampOf(d.updatedAt) ?? created(d);

  // People
  const peopleC = counters();
  const personIds = new Set<string>();
  /** The old users-collection ids (kept on people after the merge) → the person's ObjectId. */
  const oldUserIds = new Map<string, string>();
  const peoplePlan: Planned<PersonRow> = {
    collection: 'people',
    mongo: raw.people.length,
    counters: peopleC,
    rows: raw.people.map((d) => {
      const legacyId = refOf(d._id)!;
      personIds.add(legacyId);
      const oldUser = refOf(d.legacyUserId);
      if (oldUser) oldUserIds.set(oldUser, legacyId);
      const roles: unknown[] = Array.isArray(d.roles) ? d.roles : [];
      const first = roles[0];
      const role = typeof first === 'string' && ROLES.has(first) ? first : null;
      if (roles.length > 1)
        report.notes.push(`people ${legacyId}: roles ${JSON.stringify(roles)}, kept ${role}`);
      if (roles.length && !role)
        report.notes.push(`people ${legacyId}: unknown role ${JSON.stringify(first)}, no access`);
      const email = textOf(d.email)?.trim() || null;
      return {
        legacyId,
        row: {
          firstName: textOf(d.firstName),
          middleName: textOf(d.middleName),
          lastName: textOf(d.lastName),
          email,
          phone: textOf(d.phone),
          address: (isPlainObject(d.address) ? d.address : {}) as Address,
          dob: dayOf(d.dob, peopleC),
          emergencyContacts: Array.isArray(d.emergencyContacts)
            ? d.emergencyContacts.filter(isPlainObject)
            : [],
          customFields: isPlainObject(d.customFields) ? d.customFields : {},
          role: role as PersonRow['role'],
          isActive: d.isActive !== false,
          lastLoginAt: timestampOf(d.lastLoginAt),
          loginCount: Number.isFinite(Number(d.loginCount)) ? Number(d.loginCount) : 0,
          lastLoginIp: textOf(d.lastLoginIp),
          lastUserAgent: textOf(d.lastUserAgent),
          legacyId,
          createdAt: created(d),
          updatedAt: updated(d),
        },
      };
    }),
  };
  // Sign-in emails must be unique (case-insensitive) among people with a role.
  const signInEmails = new Map<string, string[]>();
  for (const { legacyId, row } of peoplePlan.rows) {
    if (!row.role || !row.email) continue;
    const key = row.email.toLowerCase();
    signInEmails.set(key, [...(signInEmails.get(key) ?? []), legacyId]);
  }
  for (const [email, ids] of signInEmails)
    if (ids.length > 1)
      report.conflicts.push(`people ${ids.join(', ')}: all sign in with ${email}`);

  /** A reference to a person; a missing one is null (counted and noted). */
  const personRef = (v: unknown, c: Counters, what: string): string | null => {
    const id = refOf(v);
    if (!id) return null;
    if (personIds.has(id)) return id;
    c.nulledRefs++;
    report.notes.push(`${what}: person ${id} not found, cleared`);
    return null;
  };

  // Rigs
  const rigsC = counters();
  const rigIds = new Set<string>();
  const rigsPlan: Planned<RigRow> = {
    collection: 'rigs',
    mongo: raw.rigs.length,
    counters: rigsC,
    rows: raw.rigs.map((d) => {
      const legacyId = refOf(d._id)!;
      rigIds.add(legacyId);
      return {
        legacyId,
        row: {
          name: textOf(d.name),
          number: textOf(d.number),
          container: textOf(d.container),
          containerSerialNumber: textOf(d.containerSerialNumber),
          containerDOM: dayOf(d.containerDOM, rigsC),
          mainSize: textOf(d.mainSize),
          mainDOM: dayOf(d.mainDOM, rigsC),
          mainSerialNumber: textOf(d.mainSerialNumber),
          reserveSize: textOf(d.reserveSize),
          reserveDOM: dayOf(d.reserveDOM, rigsC),
          reserveSerialNumber: textOf(d.reserveSerialNumber),
          lastPacked: dayOf(d.lastPacked, rigsC),
          riggerINT: textOf(d.riggerINT),
          repackDue: dayOf(d.repackDue, rigsC),
          aadType: textOf(d.aadType),
          aadDOM: dayOf(d.aadDOM, rigsC),
          aadSerialNumber: textOf(d.aadSerialNumber),
          // The spreadsheet import's former rig names have no column; they're kept as a custom field.
          customFields: {
            ...((isPlainObject(d.customFields) ? d.customFields : {}) as CustomFields),
            ...(textOf(d.pastNaming) ? { 'Past name': textOf(d.pastNaming) } : {}),
          } as CustomFields,
          primaryRef: personRef(d.primaryUserId, rigsC, `rigs ${legacyId} primaryUserId`),
          notes: textOf(d.notes),
          imageUrl: textOf(d.imageUrl),
          legacyId,
          createdAt: created(d),
          updatedAt: updated(d),
        },
      };
    }),
  };

  // Gear
  const gearC = counters();
  const serials = new Map<string, string[]>();
  const gearPlan: Planned<GearRow> = {
    collection: 'gear',
    mongo: raw.gear.length,
    counters: gearC,
    rows: raw.gear.map((d) => {
      const legacyId = refOf(d._id)!;
      const serialNumber = textOf(d.serialNumber)?.trim() || null;
      if (serialNumber) serials.set(serialNumber, [...(serials.get(serialNumber) ?? []), legacyId]);
      const notes = textOf(d.notes);
      if (notes && notes.length > 1000)
        report.conflicts.push(`gear ${legacyId}: notes are ${notes.length} characters (max 1000)`);
      let rigRef = refOf(d.assignedRigId);
      if (rigRef && !rigIds.has(rigRef)) {
        gearC.nulledRefs++;
        report.notes.push(`gear ${legacyId} assignedRigId: rig ${rigRef} not found, cleared`);
        rigRef = null;
      }
      return {
        legacyId,
        row: {
          serialNumber,
          name: textOf(d.name),
          type: textOf(d.type),
          dateOfManufacture: dayOf(d.dateOfManufacture, gearC),
          notes,
          imageUrl: textOf(d.imageUrl),
          rigRef,
          personRef: personRef(d.assignedPersonId, gearC, `gear ${legacyId} assignedPersonId`),
          legacyId,
          createdAt: created(d),
          updatedAt: updated(d),
        },
      };
    }),
  };
  for (const [serial, ids] of serials)
    if (ids.length > 1)
      report.conflicts.push(`gear ${ids.join(', ')}: share serial number ${serial}`);

  // Events
  const eventsC = counters();
  const eventsPlan: Planned<EventRow> = {
    collection: 'events',
    mongo: raw.events.length,
    counters: eventsC,
    rows: raw.events.map((d) => {
      const legacyId = refOf(d._id)!;
      return {
        legacyId,
        row: {
          name: textOf(d.name),
          eventDate: dayOf(d.eventDate, eventsC),
          description: textOf(d.description),
          eventPhotoUrl: textOf(d.eventPhotoUrl),
          photoUrls: Array.isArray(d.photoUrls)
            ? d.photoUrls.filter((u): u is string => typeof u === 'string' && !!u)
            : [],
          legacyId,
          createdAt: created(d),
          updatedAt: updated(d),
        },
      };
    }),
  };

  // Sessions still in use, and links not yet used
  const sessionsC = counters();
  let deadSessions = 0;
  const sessionsPlan: Planned<SessionRow> = {
    collection: 'sessions',
    mongo: raw.sessions.length,
    counters: sessionsC,
    rows: raw.sessions.flatMap((d) => {
      const legacyId = refOf(d._id)!;
      const expiresAt = timestampOf(d.expiresAt);
      const tokenHash = textOf(d.sessionId);
      if (d.revokedAt || !expiresAt || expiresAt <= now || !tokenHash || !HASH.test(tokenHash)) {
        deadSessions++;
        return [];
      }
      const ref = personRef(d.userId, sessionsC, `sessions ${legacyId}`);
      if (!ref) return [];
      return [
        {
          legacyId,
          row: {
            tokenHash,
            personRef: ref,
            csrfToken: textOf(d.csrfToken),
            expiresAt,
            revokedAt: null,
            ip: textOf(d.ip),
            userAgent: textOf(d.userAgent),
            legacyId,
            createdAt: created(d),
          },
        },
      ];
    }),
  };
  if (deadSessions) report.notes.push(`sessions: ${deadSessions} revoked or expired, skipped`);

  const linksC = counters();
  let deadLinks = 0;
  const linksPlan: Planned<LinkRow> = {
    collection: 'sign_in_links',
    mongo: raw.sign_in_links.length,
    counters: linksC,
    rows: raw.sign_in_links.flatMap((d) => {
      const legacyId = refOf(d._id)!;
      const expiresAt = timestampOf(d.expiresAt);
      const tokenHash = textOf(d.tokenHash);
      if (d.usedAt || !expiresAt || expiresAt <= now || !tokenHash || !HASH.test(tokenHash)) {
        deadLinks++;
        return [];
      }
      const ref = personRef(d.userId, linksC, `sign_in_links ${legacyId}`);
      if (!ref) return [];
      return [
        {
          legacyId,
          row: {
            tokenHash,
            personRef: ref,
            expiresAt,
            usedAt: null,
            createdByEmail: textOf(d.createdByEmail),
            legacyId,
            createdAt: created(d),
          },
        },
      ];
    }),
  };
  if (deadLinks) report.notes.push(`sign_in_links: ${deadLinks} used or expired, skipped`);

  // Audit log: actors are people (or their old users-collection id).
  const auditC = counters();
  let unknownActors = 0;
  const auditPlan: Planned<AuditRow> = {
    collection: 'audit_logs',
    mongo: raw.audit_logs.length,
    counters: auditC,
    rows: raw.audit_logs.map((d) => {
      const legacyId = refOf(d._id)!;
      const userId = refOf(d.userId);
      const actorRef = userId ? (personIds.has(userId) ? userId : oldUserIds.get(userId)) : null;
      const details = isPlainObject(d.details) ? { ...d.details } : null;
      let keptDetails = details;
      if (userId && !actorRef) {
        unknownActors++;
        keptDetails = { ...(details ?? {}), legacyUserId: userId };
      }
      return {
        legacyId,
        row: {
          action: textOf(d.action) ?? 'UNKNOWN',
          resource: textOf(d.resource) ?? 'unknown',
          resourceId: refOf(d.resourceId) ?? '',
          resourceName: textOf(d.resourceName),
          actorRef: actorRef ?? null,
          userEmail: textOf(d.userEmail),
          userDisplayName: textOf(d.userDisplayName),
          details: keptDetails,
          legacyId,
          createdAt: created(d),
        },
      };
    }),
  };
  if (unknownActors)
    report.notes.push(
      `audit_logs: ${unknownActors} entries by someone not in people; actor id kept in details.legacyUserId`,
    );

  return {
    peoplePlan,
    rigsPlan,
    gearPlan,
    eventsPlan,
    sessionsPlan,
    linksPlan,
    auditPlan,
    oldUserIds,
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

type Upsertable =
  typeof people | typeof rigs | typeof gear | typeof events | typeof sessions | typeof signInLinks;

/** Inserts rows, or replaces the ones already imported (same legacy_id); returns legacy id → id. */
async function upsert(
  tx: Tx,
  table: Upsertable,
  rows: Array<Record<string, unknown>>,
): Promise<Map<string, string>> {
  // ON CONFLICT (legacy_id) DO UPDATE SET <every column but id> = excluded.<column>
  const set = Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => key !== 'id')
      .map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
  );
  const ids = new Map<string, string>();
  for (const batch of chunks(rows)) {
    const written: Array<{ id: string; legacyId: string | null }> = await tx
      .insert(table)
      .values(batch as never)
      .onConflictDoUpdate({ target: table.legacyId, set })
      .returning({ id: table.id, legacyId: table.legacyId });
    for (const r of written) if (r.legacyId) ids.set(r.legacyId, r.id);
  }
  return ids;
}

async function countLegacy(db: Database | Tx, table: Upsertable | typeof auditLog, ids: string[]) {
  let n = 0;
  for (const batch of chunks(ids)) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(inArray(table.legacyId, batch));
    n += row?.n ?? 0;
  }
  return n;
}

class Mismatch extends Error {}

/** Runs the import (a dry run unless `apply`) and returns what it found and did. */
export async function importMongo(opts: ImportOptions): Promise<ImportReport> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const report: ImportReport = {
    applied: false,
    ok: false,
    collections: [],
    conflicts: [],
    notes: [],
    unknownFields: {},
  };
  const now = new Date();
  const client = new MongoClient(opts.mongoUri);
  const pool = createPool(opts.databaseUrl);
  const db = createDb(pool);
  try {
    await client.connect();
    const p = await plan(client, report, now);
    const targets = [
      [p.peoplePlan, people],
      [p.rigsPlan, rigs],
      [p.gearPlan, gear],
      [p.eventsPlan, events],
      [p.sessionsPlan, sessions],
      [p.linksPlan, signInLinks],
      [p.auditPlan, auditLog],
    ] as const;

    const tally = async (exec: Database | Tx) => {
      report.collections = [];
      for (const [planned, table] of targets) {
        report.collections.push({
          collection: planned.collection,
          table: getTableName(table),
          mongo: planned.mongo,
          toImport: planned.rows.length,
          postgres: await countLegacy(
            exec,
            table,
            planned.rows.map((r) => r.legacyId),
          ),
          nulledDates: planned.counters.nulledDates,
          nulledRefs: planned.counters.nulledRefs,
        });
      }
    };

    if (!opts.apply || report.conflicts.length) {
      await tally(db);
      report.ok = report.conflicts.length === 0;
      printReport(report, log, opts.apply);
      return report;
    }

    try {
      await db.transaction(async (tx) => {
        const personIds = await upsert(
          tx,
          people,
          p.peoplePlan.rows.map((r) => r.row),
        );
        const rigIds = await upsert(
          tx,
          rigs,
          p.rigsPlan.rows.map(({ row: { primaryRef, ...row } }) => ({
            ...row,
            primaryUserId: primaryRef ? personIds.get(primaryRef)! : null,
          })),
        );
        const gearIds = await upsert(
          tx,
          gear,
          p.gearPlan.rows.map(({ row: { rigRef, personRef, ...row } }) => ({
            ...row,
            assignedRigId: rigRef ? rigIds.get(rigRef)! : null,
            assignedPersonId: personRef ? personIds.get(personRef)! : null,
          })),
        );
        const eventIds = await upsert(
          tx,
          events,
          p.eventsPlan.rows.map((r) => r.row),
        );
        await upsert(
          tx,
          sessions,
          p.sessionsPlan.rows.map(({ row: { personRef, ...row } }) => ({
            ...row,
            personId: personIds.get(personRef)!,
          })),
        );
        await upsert(
          tx,
          signInLinks,
          p.linksPlan.rows.map(({ row: { personRef, ...row } }) => ({
            ...row,
            personId: personIds.get(personRef)!,
          })),
        );
        // Ids that name an imported record now name its new UUID.
        const anyId = (id: string) =>
          personIds.get(id) ??
          personIds.get(p.oldUserIds.get(id) ?? '') ??
          rigIds.get(id) ??
          gearIds.get(id) ??
          eventIds.get(id) ??
          id;
        // Append-only: entries already imported are left alone (ON CONFLICT DO NOTHING).
        for (const batch of chunks(p.auditPlan.rows)) {
          await tx
            .insert(auditLog)
            .values(
              batch.map(({ row: { actorRef, ...row } }) => ({
                ...row,
                resourceId: anyId(row.resourceId),
                userId: actorRef ? (personIds.get(actorRef) ?? null) : null,
              })),
            )
            .onConflictDoNothing({ target: auditLog.legacyId });
        }

        await tally(tx);
        if (report.collections.some((c) => c.postgres !== c.toImport)) throw new Mismatch();
      });
      report.applied = true;
      report.ok = true;
    } catch (err) {
      if (!(err instanceof Mismatch)) throw err;
      report.ok = false;
      report.notes.push('Counts did not match, so the transaction was rolled back.');
    }
    printReport(report, log, true);
    return report;
  } finally {
    await client.close();
    await pool.end();
  }
}

function printReport(report: ImportReport, log: (line: string) => void, apply: boolean) {
  const heading = report.applied
    ? 'Imported (verification: Mongo vs Postgres)'
    : apply
      ? 'Not imported'
      : 'Dry run: nothing written (run again with --apply to import)';
  log(heading);
  const header = ['collection', 'mongo', 'to import', 'postgres', 'dates→null', 'refs→null', ''];
  const rows = report.collections.map((c) => [
    c.collection,
    String(c.mongo),
    String(c.toImport),
    String(c.postgres),
    String(c.nulledDates),
    String(c.nulledRefs),
    report.applied || apply ? (c.postgres === c.toImport ? 'ok' : 'MISMATCH') : '',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => (i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)))
      .join('  ')
      .trimEnd();
  log(line(header));
  for (const r of rows) log(line(r));
  for (const [collection, fields] of Object.entries(report.unknownFields))
    log(
      `${collection}: fields without a column, not imported: ${Object.entries(fields)
        .map(([f, n]) => `${f} (${n})`)
        .join(', ')}`,
    );
  for (const note of report.notes) log(`note: ${note}`);
  for (const conflict of report.conflicts) log(`CONFLICT: ${conflict}`);
  if (report.conflicts.length) log('Fix the conflicts in Mongo first; nothing was written.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mongoUri = readSecret('MONGO_URI');
  if (!mongoUri) {
    console.error('Set MONGO_URI (or MONGO_URI_FILE) to the Mongo database to import from.');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  importMongo({ mongoUri, databaseUrl: loadConfig().DATABASE_URL, apply })
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
