import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.js';
import { people, sessions, signInLinks, type Person } from '../db/schema.js';
import { UUID_PATTERN } from '../common/validation.js';
import { personToApi, shortName } from '../people/person-view.js';
import { SIGN_IN_LINK_TTL_MS, hashToken, newToken } from './tokens.js';
import type { AuthUser, Role } from './auth-user.js';

export { ROLES, type Role } from './auth-user.js';

export const SESSION_COOKIE_NAME = 'rigtracker_session';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
/** Expired sessions and links are deleted this often (Postgres has no TTL index). */
const CLEANUP_INTERVAL_MS = 1000 * 60 * 60;

/** Signed-in people are people records with a role; sessions and links point at the person. */
@Injectable()
export class AuthService implements OnApplicationBootstrap, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;

  constructor(@Inject(DB) private readonly db: Database) {}

  async onApplicationBootstrap() {
    await this.deleteExpired();
    this.cleanupTimer = setInterval(() => void this.deleteExpired(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  /** Removes sessions and sign-in links past their expiry (cheap: both are indexed on it). */
  async deleteExpired() {
    try {
      const now = new Date();
      await this.db.delete(sessions).where(lt(sessions.expiresAt, now));
      await this.db.delete(signInLinks).where(lt(signInLinks.expiresAt, now));
    } catch (err) {
      console.error('[AuthService] Could not delete expired sessions:', err);
    }
  }

  getSessionDurationMs() {
    return SESSION_DURATION_MS;
  }

  getSessionCookieName() {
    return SESSION_COOKIE_NAME;
  }

  private canSignIn(p: Person | null | undefined): p is Person {
    return !!p && !!p.role && p.isActive && !!p.email;
  }

  private async findPerson(id: string) {
    if (!UUID_PATTERN.test(id)) throw new BadRequestException('Invalid id: record ids are UUIDs');
    const [person] = await this.db.select().from(people).where(eq(people.id, id));
    return person;
  }

  /** Makes a single-use sign-in link token for someone with sign-in access. */
  async createSignInLink(personId: string, createdByEmail?: string) {
    const person = await this.findPerson(personId);
    if (!person) throw new NotFoundException('Person not found');
    if (!this.canSignIn(person))
      throw new BadRequestException('Give this person sign-in access first');
    const token = newToken();
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS);
    await this.db.insert(signInLinks).values({
      tokenHash: hashToken(token),
      personId: person.id,
      expiresAt,
      createdByEmail: createdByEmail ?? null,
    });
    return { token, expiresAt, user: this.mapUser(person) };
  }

  /** Who a link is for, without using it up (so a phone previewing the link can't spoil it). */
  async peekSignInLink(token: string) {
    const [row] = await this.db
      .select({ person: people })
      .from(signInLinks)
      .innerJoin(people, eq(people.id, signInLinks.personId))
      .where(
        and(
          eq(signInLinks.tokenHash, hashToken(token)),
          isNull(signInLinks.usedAt),
          gt(signInLinks.expiresAt, sql`now()`),
        ),
      );
    if (!this.canSignIn(row?.person)) return null;
    const user = this.mapUser(row.person);
    return { email: user.email, displayName: user.displayName };
  }

  /** Uses up a link and starts a session. Returns null for an unknown, used or expired link. */
  async redeemSignInLink(
    token: string,
    meta: { ip?: string | undefined; userAgent?: string | undefined },
  ) {
    return this.db.transaction(async (tx) => {
      // Atomic: of two simultaneous uses, only one gets the row back.
      const [link] = await tx
        .update(signInLinks)
        .set({ usedAt: sql`now()` })
        .where(
          and(
            eq(signInLinks.tokenHash, hashToken(token)),
            isNull(signInLinks.usedAt),
            gt(signInLinks.expiresAt, sql`now()`),
          ),
        )
        .returning({ personId: signInLinks.personId });
      if (!link) return null;
      const [person] = await tx.select().from(people).where(eq(people.id, link.personId));
      if (!this.canSignIn(person)) return null;
      const [signedIn] = await tx
        .update(people)
        .set({
          lastLoginAt: new Date(),
          lastLoginIp: meta.ip ?? null,
          lastUserAgent: meta.userAgent ?? null,
          loginCount: sql`${people.loginCount} + 1`,
        })
        .where(eq(people.id, person.id))
        .returning();

      const sessionToken = newToken();
      const csrfToken = newToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      await tx.insert(sessions).values({
        tokenHash: hashToken(sessionToken),
        personId: person.id,
        expiresAt,
        csrfToken,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      return { sessionToken, csrfToken, expiresAt, user: this.mapUser(signedIn!) };
    });
  }

  async getAuthenticatedUser(sessionToken?: string) {
    if (!sessionToken) return null;
    const [row] = await this.db
      .select({ session: sessions, person: people })
      .from(sessions)
      .innerJoin(people, eq(people.id, sessions.personId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(sessionToken)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
        ),
      );
    if (!row || !this.canSignIn(row.person)) return null;

    let csrfToken = row.session.csrfToken;
    if (!csrfToken) {
      // Sessions made before CSRF tokens existed get one on first use.
      csrfToken = newToken();
      const [set] = await this.db
        .update(sessions)
        .set({ csrfToken })
        .where(and(eq(sessions.id, row.session.id), isNull(sessions.csrfToken)))
        .returning({ csrfToken: sessions.csrfToken });
      if (!set) {
        // Another request gave it one first: use that.
        const [again] = await this.db
          .select({ csrfToken: sessions.csrfToken })
          .from(sessions)
          .where(eq(sessions.id, row.session.id));
        csrfToken = again?.csrfToken ?? csrfToken;
      }
    }

    return { user: this.mapUser(row.person), expiresAt: row.session.expiresAt, csrfToken };
  }

  async logout(sessionToken?: string) {
    if (!sessionToken) return { ok: true };
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hashToken(sessionToken)), isNull(sessions.revokedAt)));
    return { ok: true };
  }

  /** Signs someone out on every device. */
  async revokeAllSessions(personId: string) {
    if (!UUID_PATTERN.test(personId))
      throw new BadRequestException('Invalid id: record ids are UUIDs');
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.personId, personId), isNull(sessions.revokedAt)));
  }

  /**
   * Gives a person sign-in access with a role, or takes it away (null), which also signs them
   * out everywhere. They need an email address that no one else who signs in uses (enforced by
   * a unique index: a clash is 409, see PgErrorsFilter).
   */
  async setAccess(personId: string, role: Role | null) {
    const person = await this.findPerson(personId);
    if (!person) throw new NotFoundException('Person not found');
    if (role && !person.email)
      throw new BadRequestException('Add an email address before giving sign-in access');
    const [updated] = await this.db
      .update(people)
      .set({ role, isActive: true })
      .where(eq(people.id, personId))
      .returning();
    if (!role) await this.revokeAllSessions(personId);
    return { before: personToApi(person), after: personToApi(updated!) };
  }

  extractCookie(cookieHeader: string | undefined, name: string): string | undefined {
    if (!cookieHeader || !name) return undefined;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (key === name) {
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      }
    }
    return undefined;
  }

  private mapUser(person: Person): AuthUser {
    return {
      id: person.id,
      email: person.email || '',
      displayName: shortName(person),
      roles: person.role ? [person.role] : [],
      isActive: person.isActive,
      lastLoginAt: person.lastLoginAt,
      loginCount: person.loginCount,
    };
  }
}
