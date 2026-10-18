import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
    // ── Password and authenticator (never returned by the API) ────────────────
    /** Argon2id. Null: no password yet, so they can only get in with a password link. */
    passwordHash: text('password_hash'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    /** Wrong passwords or codes since the last success or lockout. */
    failedAttempts: integer('failed_attempts').notNull().default(0),
    /** Cooling down after too many wrong tries; the API shows it as `lockedUntil` while in the future. */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** Lockouts in a row: each one doubles the next (15 minutes up to 24 hours). */
    lockoutCount: integer('lockout_count').notNull().default(0),
    /** The authenticator app's key, AES-256-GCM encrypted with APP_SECRET (set during setup too). */
    totpSecretEnc: text('totp_secret_enc'),
    /** Set once a code confirmed the setup: authenticator codes are on. */
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    /** The 30-second step of the last code used, so each code works once. */
    totpLastStep: integer('totp_last_step'),
    /** SHA-256 hashes of the unused recovery codes. */
    recoveryCodeHashes: jsonb('recovery_code_hashes').$type<string[]>(),
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
    // Guests' /uploads requests are checked against the media table by url.
    index('media_url_idx').on(t.url),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    /** SHA-256 hash of the session cookie's token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    /** Null only for a guest session. */
    personId: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
    /** "Look around as a guest": read-only rigs, gear and events, no person. */
    isGuest: boolean('is_guest').notNull().default(false),
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
    check('sessions_person_or_guest', sql`(${t.personId} is not null) <> ${t.isGuest}`),
  ],
);

/**
 * What a sign-in token is for: 'password' is a link an admin passes on to set a password
 * (72 hours); 'code_after_password' and 'code_after_link' are the short-lived step between
 * a right password (or a password set from a link) and the authenticator code.
 */
export const SIGN_IN_TOKEN_PURPOSES = [
  'password',
  'code_after_password',
  'code_after_link',
] as const;
export type SignInTokenPurpose = (typeof SIGN_IN_TOKEN_PURPOSES)[number];

/** A single-use sign-in token (see purpose). Only the SHA-256 hash of its token is stored. */
export const signInLinks = pgTable(
  'sign_in_links',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    purpose: text('purpose').$type<SignInTokenPurpose>().notNull().default('password'),
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
    check(
      'sign_in_links_purpose_check',
      sql`${t.purpose} in ('password', 'code_after_password', 'code_after_link')`,
    ),
  ],
);

/**
 * Password and code attempts by visitor IP, for the per-IP limit (TeeMate's approach: each try
 * is recorded before it's counted, so a burst of parallel tries can't slip past). Rows older
 * than a day are deleted.
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** password | code */
    kind: text('kind').$type<'password' | 'code'>().notNull(),
    ip: text('ip').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('auth_attempts_ip_idx').on(t.kind, t.ip, t.createdAt)],
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
    /**
     * CREATE | UPDATE | DELETE | SIGN_IN | SIGN_IN_FAILED | SIGN_OUT | SIGN_IN_LINK |
     * PASSWORD_SET | PASSWORD_CHANGE | LOCKOUT | UNLOCK | TOTP_ON | TOTP_OFF | TOTP_RESET |
     * RECOVERY_CODES | GUEST_SIGN_IN
     */
    action: text('action').notNull(),
    /** gear | rigs | people | events | guests */
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

/** Who a notice is for (notices.audience). */
export const NOTICE_AUDIENCES = ['everyone', 'person', 'public'] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

/**
 * Notices from admins: to everyone who signs in, one person, or the public (everyone signed
 * in and guests). Each shows as a banner at the top of every page for a while (banner_until,
 * or by default a week, two days for one person; pinned "must see" ones until each person
 * dismisses them) and stays in the notices list. The author has no foreign key: notices
 * outlive them, so their name is kept too.
 */
export const notices = pgTable(
  'notices',
  {
    id: id(),
    title: text('title'),
    body: text('body').notNull(),
    audience: text('audience').$type<NoticeAudience>().notNull(),
    /** For audience 'person': who it's for (deleted with them). */
    recipientId: uuid('recipient_id').references(() => people.id, { onDelete: 'cascade' }),
    /** Must see: a banner until each person dismisses it. */
    pinned: boolean('pinned').notNull().default(false),
    /** When it stops showing as a banner (it stays in the list); null: the default. */
    bannerUntil: timestamp('banner_until', { withTimezone: true }),
    authorId: uuid('author_id'),
    authorName: text('author_name'),
    createdAt: createdAt(),
    /** Set when edited: an edited notice is new (and a banner) again for everyone. */
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    check('notices_audience_check', sql`${t.audience} in ('everyone', 'person', 'public')`),
    check(
      'notices_recipient_check',
      sql`(${t.audience} = 'person') = (${t.recipientId} is not null)`,
    ),
    check('notices_title_length', sql`char_length(${t.title}) <= 100`),
    check('notices_body_length', sql`char_length(${t.body}) between 1 and 1000`),
    index('notices_created_idx').on(t.createdAt.desc()),
    index('notices_recipient_idx').on(t.recipientId),
  ],
);

/** Each person's read and dismissed state of a notice (guests keep theirs in the browser). */
export const noticeReads = pgTable(
  'notice_reads',
  {
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => notices.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.noticeId, t.personId] }),
    index('notice_reads_person_idx').on(t.personId),
  ],
);

/**
 * Automatic banners a person has dismissed, by a stable key: `repack:<rigId>:<due date>` for
 * a rig's repack reminder, `repacks:<digest>` for the admins' summary. A new due date (or a
 * changed summary) is a new key, so the banner comes back.
 */
export const noticeDismissals = pgTable(
  'notice_dismissals',
  {
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.key] })],
);

export type Person = typeof people.$inferSelect;
export type Rig = typeof rigs.$inferSelect;
/**
 * "Report a problem" (TeeMate's): what someone reported, and the GitHub issue it became. Kept
 * whether or not GitHub took it. The public issue names the reporter by first name only; who
 * sent it is kept here for admins.
 */
export const bugReports = pgTable(
  'bug_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    happened: text('happened').notNull(),
    expected: text('expected'),
    page: text('page'),
    userAgent: text('user_agent'),
    appVersion: text('app_version'),
    issueNumber: integer('issue_number'),
    issueUrl: text('issue_url'),
    /** Why GitHub didn't take it (no token, an error); the report is kept either way. */
    issueError: text('issue_error'),
    createdAt: createdAt(),
  },
  (t) => [index('bug_reports_person_created_idx').on(t.personId, t.createdAt)],
);

export type Gear = typeof gear.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
