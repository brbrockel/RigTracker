import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * RigTracker's tables. Columns are snake_case in SQL and camelCase here; property names match
 * the API's field names (e.g. `primaryUserId` is the `primary_person_id` column), so rows can
 * be returned as they are. Date-only fields are `date` columns read as 'YYYY-MM-DD' strings.
 * Tables imported from MongoDB keep the old ObjectId in `legacy_id` (see scripts/import-mongo.ts).
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const day = (name: string) => date(name, { mode: 'string' });
const legacyId = () => text('legacy_id').unique();

export type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
};
export type CustomFields = Record<string, string | number | boolean | null>;

/**
 * A club member. Anyone can also be given sign-in access: a role, and a sign-in link sent to
 * their email address. People who never sign in have no role.
 */
export const people = pgTable(
  'people',
  {
    id: id(),
    firstName: text('first_name'),
    middleName: text('middle_name'),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    address: jsonb('address').$type<Address>().notNull().default({}),
    dob: day('dob'),
    emergencyContacts: jsonb('emergency_contacts')
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    // ── Sign-in (changed only through the auth module) ───────────────────────
    /** admin | user | viewer. Null: can't sign in. The API shows it as `roles: [role]`. */
    role: text('role').$type<'admin' | 'user' | 'viewer'>(),
    /** false: sign-in disabled without losing the role. */
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    loginCount: integer('login_count').notNull().default(0),
    /** Never returned by the API. */
    lastLoginIp: text('last_login_ip'),
    /** Never returned by the API. */
    lastUserAgent: text('last_user_agent'),
    legacyId: legacyId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('people_role_check', sql`${t.role} in ('admin', 'user', 'viewer')`),
    // Someone who signs in needs an email address no one else who signs in uses.
    uniqueIndex('people_sign_in_email_unique')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.role} is not null`),
  ],
);

export const rigs = pgTable(
  'rigs',
  {
    id: id(),
    name: text('name'),
    number: text('number'),
    // A rig's container, main, reserve and AAD are gear in the rig's slots (gear.slot).
    lastPacked: day('last_packed'),
    riggerINT: text('rigger_int'),
    repackDue: day('repack_due'),
    customFields: jsonb('custom_fields').$type<CustomFields>().notNull().default({}),
    /** The rig's primary person; gear on the rig goes with them. */
    primaryUserId: uuid('primary_person_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    // Photos are media rows (owner rig).
    legacyId: legacyId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('rigs_primary_person_idx').on(t.primaryUserId)],
);

/** The four places on a rig a piece of gear can fill (gear.slot). */
export const RIG_SLOTS = ['container', 'main', 'reserve', 'aad'] as const;
export type RigSlot = (typeof RIG_SLOTS)[number];

export const gear = pgTable(
  'gear',
  {
    id: id(),
    /** Unique; any number of gear can have none (NULLs are distinct). */
    serialNumber: text('serial_number').unique(),
    name: text('name'),
    type: text('type'),
    dateOfManufacture: day('date_of_manufacture'),
    notes: text('notes'),
    // Photos are media rows (owner gear).
    assignedRigId: uuid('rig_id').references(() => rigs.id, { onDelete: 'set null' }),
    assignedPersonId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    /**
     * Which of its rig's components this gear is (container, main, reserve or AAD); null for
     * other gear. Only gear on a rig has one, and a rig has at most one of each.
     */
    slot: text('slot').$type<RigSlot>(),
    legacyId: legacyId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('gear_notes_length', sql`char_length(${t.notes}) <= 1000`),
    index('gear_rig_idx').on(t.assignedRigId),
    index('gear_person_idx').on(t.assignedPersonId),
    check('gear_slot_check', sql`${t.slot} in ('container', 'main', 'reserve', 'aad')`),
    uniqueIndex('gear_rig_slot_unique')
      .on(t.assignedRigId, t.slot)
      .where(sql`${t.slot} is not null`),
  ],
);

export const events = pgTable('events', {
  id: id(),
  name: text('name'),
  eventDate: day('event_date'),
  description: text('description'),
  // Photos and videos are media rows (owner event); the cover is the main one.
  legacyId: legacyId(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Who a photo or video belongs to (media.owner_type). */
export const MEDIA_OWNER_TYPES = ['rig', 'gear', 'event'] as const;
export type MediaOwnerType = (typeof MEDIA_OWNER_TYPES)[number];
export const MEDIA_KINDS = ['photo', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * The photos and videos of rigs, gear and events, in order: position 0 is the cover (an
 * event's main photo). url is an /uploads/... path (or an https link carried over from 1.x).
 * No foreign key to the owner, as owners live in three tables: the rig, gear and event
 * services delete an owner's media (rows and files) when they delete it. Migration 0004
 * copied the old image_url, event_photo_url and photo_urls columns in; a later release drops
 * those columns.
 */
export const media = pgTable(
  'media',
  {
    id: id(),
    ownerType: text('owner_type').$type<MediaOwnerType>().notNull(),
    ownerId: uuid('owner_id').notNull(),
    url: text('url').notNull(),
    kind: text('kind').$type<MediaKind>().notNull(),
    caption: text('caption'),
    /** 0 is the cover; then the order they're shown in. */
    position: integer('position').notNull().default(0),
    /** The person who added it (no foreign key: it outlives them). */
    uploadedBy: uuid('uploaded_by'),
    createdAt: createdAt(),
  },
  (t) => [
    check('media_owner_type_check', sql`${t.ownerType} in ('rig', 'gear', 'event')`),
    check('media_kind_check', sql`${t.kind} in ('photo', 'video')`),
    check('media_caption_length', sql`char_length(${t.caption}) <= 200`),
    index('media_owner_idx').on(t.ownerType, t.ownerId, t.position),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    /** SHA-256 hash of the session cookie's token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    /** Sent back in the x-csrf-token header with every change. */
    csrfToken: text('csrf_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    legacyId: legacyId(),
    createdAt: createdAt(),
  },
  (t) => [
    index('sessions_person_idx').on(t.personId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/** A single-use sign-in link. Only the SHA-256 hash of its token is stored. */
export const signInLinks = pgTable(
  'sign_in_links',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Admin who made it; empty when made with the command-line script. */
    createdByEmail: text('created_by_email'),
    legacyId: legacyId(),
    createdAt: createdAt(),
  },
  (t) => [
    index('sign_in_links_person_idx').on(t.personId),
    index('sign_in_links_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Who did what. Append-only: a trigger refuses UPDATE and DELETE (migration 0001); TRUNCATE
 * (used only by the tests) isn't a row operation and still works. No foreign keys: entries
 * outlive the people and records they mention. Field names match the API's.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    /** CREATE | UPDATE | DELETE | SIGN_IN | SIGN_OUT | SIGN_IN_LINK */
    action: text('action').notNull(),
    /** gear | rigs | people | events */
    resource: text('resource').notNull(),
    resourceId: text('resource_id').notNull(),
    resourceName: text('resource_name'),
    userId: uuid('actor_id'),
    userEmail: text('actor_email'),
    userDisplayName: text('actor_name'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    /** For updates: the record before and after the change. */
    before: jsonb('before'),
    after: jsonb('after'),
    legacyId: legacyId(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_resource_idx').on(t.resource, t.createdAt.desc()),
    index('audit_log_created_idx').on(t.createdAt.desc()),
  ],
);

export type Person = typeof people.$inferSelect;
export type Rig = typeof rigs.$inferSelect;
export type Gear = typeof gear.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Media = typeof media.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
