import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { getConnectionToken } from '@nestjs/mongoose'
import { Test } from '@nestjs/testing'
import type { Connection } from 'mongoose'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect } from 'vitest'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app'
import { hashToken, newToken } from '../src/auth/tokens'

export const SESSION_COOKIE = 'rigtracker_session'

export interface TestApp {
  app: INestApplication
  /** The app's own database connection, for setting up records and checking stored rows. */
  db: Connection
  close(): Promise<void>
}

/** Boots the real AppModule against the test database (MONGO_URI from vitest.config.mts). */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication({ logger: ['error'] })
  configureApp(app)
  await app.init()
  const db = app.get<Connection>(getConnectionToken())
  // Unique indexes (e.g. gear serial numbers) must exist before the tests rely on them.
  await Promise.all(Object.values(db.models).map((m) => m.init()))
  return { app, db, close: () => app.close() }
}

/** Empties every collection (keeping indexes). */
export async function resetDb(t: TestApp): Promise<void> {
  const collections = await t.db.db.collections()
  await Promise.all(collections.map((c) => c.deleteMany({})))
}

let ipCounter = Math.floor(Math.random() * 60_000)
/**
 * A fresh visitor IP (sent as CF-Connecting-IP). Rate limits are per IP, so each signed-in
 * person and each anonymous request gets its own and tests don't trip limits meant for others.
 */
export function nextIp(): string {
  ipCounter++
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`
}

export type Role = 'admin' | 'user' | 'viewer'

let personCounter = 0
/** Inserts a person straight into the database. */
export async function createPerson(
  t: TestApp,
  fields: Record<string, unknown> = {},
): Promise<{ id: string; email?: string }> {
  personCounter++
  const doc = {
    firstName: 'Test',
    lastName: `Person${personCounter}`,
    email: `person${personCounter}-${Date.now()}@example.com`,
    roles: [],
    isActive: true,
    loginCount: 0,
    ...fields,
  }
  const { insertedId } = await t.db.collection('people').insertOne(doc)
  return { id: String(insertedId), email: doc.email as string | undefined }
}

/** Stores a sign-in link for a person and returns its token (as an admin-made link would be). */
export async function createLinkToken(
  t: TestApp,
  personId: string,
  expiresAt = new Date(Date.now() + 60 * 60 * 1000),
): Promise<string> {
  const token = newToken()
  await t.db.collection('sign_in_links').insertOne({
    tokenHash: hashToken(token),
    userId: new Types.ObjectId(personId),
    expiresAt,
    createdAt: new Date(),
  })
  return token
}

/** Anonymous requests, each from a fresh IP. */
export function anon(t: TestApp) {
  const r = () => request(t.app.getHttpServer())
  return {
    get: (path: string) => r().get(path).set('CF-Connecting-IP', nextIp()),
    post: (path: string, body: object = {}) => r().post(path).set('CF-Connecting-IP', nextIp()).send(body),
    put: (path: string, body: object = {}) => r().put(path).set('CF-Connecting-IP', nextIp()).send(body),
    patch: (path: string, body: object = {}) => r().patch(path).set('CF-Connecting-IP', nextIp()).send(body),
    delete: (path: string) => r().delete(path).set('CF-Connecting-IP', nextIp()),
  }
}

export interface SignedIn {
  id: string
  email: string
  ip: string
  csrf: string
  sessionToken: string
  /** Keeps the session cookie and sends this person's IP. */
  agent: ReturnType<typeof request.agent>
}

/** Signs a person in through the real sign-in link flow. */
export async function signIn(t: TestApp, personId: string): Promise<SignedIn> {
  const ip = nextIp()
  const agent = request.agent(t.app.getHttpServer()).set('CF-Connecting-IP', ip).set('User-Agent', 'rigtracker-tests')
  const token = await createLinkToken(t, personId)
  const res = await agent.post('/api/auth/link/redeem').send({ token })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  const sessionToken = decodeURIComponent(cookie!.split(';')[0].slice(SESSION_COOKIE.length + 1))
  return { id: personId, email: res.body.user.email, ip, csrf: res.body.csrfToken, sessionToken, agent }
}

/** Creates a person with a role and signs them in. */
export async function signInAs(t: TestApp, role: Role, fields: Record<string, unknown> = {}): Promise<SignedIn> {
  const person = await createPerson(t, { roles: [role], ...fields })
  return signIn(t, person.id)
}

/** Requests as a signed-in person, with their CSRF token on every change. */
export function as(who: SignedIn) {
  return {
    get: (path: string) => who.agent.get(path),
    post: (path: string, body: object = {}) => who.agent.post(path).set('x-csrf-token', who.csrf).send(body),
    put: (path: string, body: object = {}) => who.agent.put(path).set('x-csrf-token', who.csrf).send(body),
    patch: (path: string, body: object = {}) => who.agent.patch(path).set('x-csrf-token', who.csrf).send(body),
    delete: (path: string) => who.agent.delete(path).set('x-csrf-token', who.csrf),
  }
}

/** A well-formed id that matches no record. */
export const MISSING_ID = '0123456789abcdef01234567'
