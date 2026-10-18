import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { hashToken, newToken } from '../src/auth/tokens.js';
import { DB, type Database } from '../src/db/db.js';
import { people, signInLinks } from '../src/db/schema.js';

export const SESSION_COOKIE = 'rigtracker_session';

export interface TestApp {
  app: INestApplication;
  /** The app's own database, for setting up records and checking stored rows. */
  db: Database;
  close(): Promise<void>;
}

/** Boots the real AppModule against the test database (DATABASE_URL from vitest.config.ts). */
/** The app as in production, with optional provider overrides (e.g. a fake issue tracker). */
export async function createTestApp(
  override: (m: TestingModuleBuilder) => TestingModuleBuilder = (m) => m,
): Promise<TestApp> {
  const moduleRef = await override(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  const db = app.get<Database>(DB);
  return { app, db, close: () => app.close() };
}

/**
 * Empties every table. TRUNCATE isn't a row-level UPDATE or DELETE, so the audit log's
 * append-only trigger allows it.
 */
export async function resetDb(t: TestApp): Promise<void> {
  await t.db.execute(sql`truncate table
    audit_log, auth_attempts, bug_reports, notice_dismissals, notice_reads, notices, sessions, sign_in_links, media, gear, rigs, events, people
    restart identity cascade`);
}

let ipCounter = Math.floor(Math.random() * 60_000);
/**
 * A fresh visitor IP (sent as CF-Connecting-IP). Rate limits are per IP, so each signed-in
 * person and each anonymous request gets its own and tests don't trip limits meant for others.
 */
export function nextIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export type Role = 'admin' | 'user' | 'viewer';

type PersonFields = Partial<typeof people.$inferInsert> & {
  /** As the API shows sign-in access: [role], or [] for none. */
  roles?: Role[];
};

let personCounter = 0;
/** Inserts a person straight into the database. */
export async function createPerson(
  t: TestApp,
  fields: PersonFields = {},
): Promise<{ id: string; email?: string }> {
  personCounter++;
  const { roles, ...rest } = fields;
  const values = {
    firstName: 'Test',
    lastName: `Person${personCounter}`,
    email: `person${personCounter}-${Date.now()}@example.com`,
    isActive: true,
    loginCount: 0,
    ...(roles ? { role: roles[0] ?? null } : {}),
    ...rest,
  };
  const [row] = await t.db.insert(people).values(values).returning();
  return { id: row!.id, email: row!.email ?? undefined };
}

/** The password signIn() gives people (one Argon2id hash, made once, keeps the tests quick). */
export const TEST_PASSWORD = 'correct horse battery staple';
let testHash: Promise<string> | undefined;
export const testPasswordHash = () => (testHash ??= hashPassword(TEST_PASSWORD));

/** Gives a person TEST_PASSWORD. */
export async function givePassword(t: TestApp, personId: string): Promise<void> {
  await t.db
    .update(people)
    .set({ passwordHash: await testPasswordHash() })
    .where(eq(people.id, personId));
}

/** Stores a password link for a person and returns its token (as an admin-made link would be). */
export async function createLinkToken(
  t: TestApp,
  personId: string,
  expiresAt = new Date(Date.now() + 60 * 60 * 1000),
): Promise<string> {
  const token = newToken();
  await t.db.insert(signInLinks).values({ tokenHash: hashToken(token), personId, expiresAt });
  return token;
}

/** Anonymous requests, each from a fresh IP. */
export function anon(t: TestApp) {
  const r = () => request(t.app.getHttpServer());
  return {
    get: (path: string) => r().get(path).set('CF-Connecting-IP', nextIp()),
    post: (path: string, body: object = {}) =>
      r().post(path).set('CF-Connecting-IP', nextIp()).send(body),
    put: (path: string, body: object = {}) =>
      r().put(path).set('CF-Connecting-IP', nextIp()).send(body),
    patch: (path: string, body: object = {}) =>
      r().patch(path).set('CF-Connecting-IP', nextIp()).send(body),
    delete: (path: string) => r().delete(path).set('CF-Connecting-IP', nextIp()),
  };
}

export interface SignedIn {
  id: string;
  email: string;
  ip: string;
  csrf: string;
  sessionToken: string;
  /** Keeps the session cookie and sends this person's IP. */
  agent: ReturnType<typeof request.agent>;
}

/** A fresh agent (cookie jar) with its own visitor IP. */
export function newAgent(t: TestApp) {
  const ip = nextIp();
  const agent = request
    .agent(t.app.getHttpServer())
    .set('CF-Connecting-IP', ip)
    .set('User-Agent', 'rigtracker-tests');
  return { ip, agent };
}

/** The session token in a response's Set-Cookie. */
export function sessionCookie(res: request.Response): string | undefined {
  const cookie = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return cookie
    ? decodeURIComponent(cookie.split(';')[0]!.slice(SESSION_COOKIE.length + 1))
    : undefined;
}

/** Signs a person in with email and password (they're given TEST_PASSWORD). */
export async function signIn(t: TestApp, personId: string): Promise<SignedIn> {
  await givePassword(t, personId);
  const [person] = await t.db.select().from(people).where(eq(people.id, personId));
  const { ip, agent } = newAgent(t);
  const res = await agent
    .post('/api/auth/sign-in')
    .send({ email: person!.email, password: TEST_PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return {
    id: personId,
    email: res.body.user.email,
    ip,
    csrf: res.body.csrfToken,
    sessionToken: sessionCookie(res)!,
    agent,
  };
}

/** A guest session ("Look around as a guest"). */
export async function signInGuest(t: TestApp): Promise<SignedIn> {
  const { ip, agent } = newAgent(t);
  const res = await agent.post('/api/auth/guest');
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return {
    id: 'guest',
    email: '',
    ip,
    csrf: res.body.csrfToken,
    sessionToken: sessionCookie(res)!,
    agent,
  };
}

/** Creates a person with a role and signs them in. */
export async function signInAs(
  t: TestApp,
  role: Role,
  fields: PersonFields = {},
): Promise<SignedIn> {
  const person = await createPerson(t, { roles: [role], ...fields });
  return signIn(t, person.id);
}

/** Requests as a signed-in person, with their CSRF token on every change. */
export function as(who: SignedIn) {
  return {
    get: (path: string) => who.agent.get(path),
    post: (path: string, body: object = {}) =>
      who.agent.post(path).set('x-csrf-token', who.csrf).send(body),
    put: (path: string, body: object = {}) =>
      who.agent.put(path).set('x-csrf-token', who.csrf).send(body),
    patch: (path: string, body: object = {}) =>
      who.agent.patch(path).set('x-csrf-token', who.csrf).send(body),
    delete: (path: string) => who.agent.delete(path).set('x-csrf-token', who.csrf),
  };
}

/** A well-formed id that matches no record. */
export const MISSING_ID = '00000000-0000-4000-8000-000000000000';
