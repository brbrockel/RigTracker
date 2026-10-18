import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, count, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { config } from '../config.js';
import { DB, type Database, type Executor } from '../db/db.js';
import {
  authAttempts,
  people,
  sessions,
  signInLinks,
  type Person,
  type SignInTokenPurpose,
} from '../db/schema.js';
import { UUID_PATTERN } from '../common/validation.js';
import { personToApi, shortName } from '../people/person-view.js';
import { assertGoodPassword, hashPassword, verifyPassword } from './password.js';
import {
  CODE_STEP_TTL_MS,
  SIGN_IN_LINK_TTL_MS,
  hashToken,
  newToken,
  normalizeEmail,
} from './tokens.js';
import {
  decryptSecret,
  encryptSecret,
  hashRecovery,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUrl,
} from './totp.js';
import { GUEST_USER, type AuthUser, type Role } from './auth-user.js';

export { ROLES, type Role } from './auth-user.js';

export const SESSION_COOKIE_NAME = 'rigtracker_session';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
/** "Look around as a guest" lasts 12 hours. */
const GUEST_SESSION_MS = 1000 * 60 * 60 * 12;
/** Expired sessions and links are deleted this often (Postgres has no TTL index). */
const CLEANUP_INTERVAL_MS = 1000 * 60 * 60;

/** Wrong passwords or codes before an account cools down, and the first cooldown (doubles each time). */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 15;
export const LOGIN_MAX_LOCK_MINUTES = 24 * 60;
/** Password (and code) attempts per visitor IP in IP_WINDOW_MS, across all accounts. */
export const LOGIN_LIMIT_PER_IP = 30;
const IP_WINDOW_MS = 15 * 60 * 1000;

const WRONG_PASSWORD = 'Email or password is incorrect';
const LINK_GONE = 'This password link has expired or was already used. Ask an admin for a new one.';
const CODE_STEP_GONE = 'This sign-in took too long. Enter your email and password again.';

/** An account cooling down after too many wrong passwords or codes. */
export class LockedException extends HttpException {
  constructor(until: Date) {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    super(
      `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask an admin to unlock your account.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class TooManyAttemptsException extends HttpException {
  constructor() {
    super('Too many sign-in attempts. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface SignedIn {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  user: AuthUser;
}

/** The right password (or a password set from a link), but the authenticator code is still needed. */
export interface NeedsCode {
  needsCode: true;
  token: string;
}

/**
 * Signed-in people are people records with a role; sessions and links point at the person.
 * Passwords, lockouts and authenticator codes follow TeeMate (doc/Security.md).
 */
@Injectable()
export class AuthService implements OnApplicationBootstrap, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    await this.deleteExpired();
    this.cleanupTimer = setInterval(() => void this.deleteExpired(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  /** Removes sessions, links and attempt records past their use (all indexed on the time). */
  async deleteExpired() {
    try {
      const now = new Date();
      await this.db.delete(sessions).where(lt(sessions.expiresAt, now));
      await this.db.delete(signInLinks).where(lt(signInLinks.expiresAt, now));
      await this.db
        .delete(authAttempts)
        .where(lt(authAttempts.createdAt, new Date(now.getTime() - 24 * 3600_000)));
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

  private async getPerson(id: string) {
    const person = await this.findPerson(id);
    if (!person) throw new NotFoundException('Person not found');
    return person;
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  private async createSession(
    exec: Executor,
    personId: string | null,
    meta: RequestMeta,
    durationMs = SESSION_DURATION_MS,
  ) {
    const sessionToken = newToken();
    const csrfToken = newToken();
    const expiresAt = new Date(Date.now() + durationMs);
    const [row] = await exec
      .insert(sessions)
      .values({
        tokenHash: hashToken(sessionToken),
        personId,
        isGuest: personId === null,
        expiresAt,
        csrfToken,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      })
      .returning({ id: sessions.id });
    return { sessionToken, csrfToken, expiresAt, sessionId: row!.id };
  }

  /**
   * Starts a session for someone who got past every check: clears wrong tries and lockouts,
   * counts the sign-in, and records it (method: password, link or code).
   */
  private async startSession(
    person: Person,
    meta: RequestMeta,
    details: Record<string, unknown>,
    extra: Partial<typeof people.$inferInsert> = {},
    exec?: Executor,
  ): Promise<SignedIn> {
    const run = async (tx: Executor) => {
      const [signedIn] = await tx
        .update(people)
        .set({
          ...extra,
          failedAttempts: 0,
          lockoutCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastLoginIp: meta.ip ?? null,
          lastUserAgent: meta.userAgent ?? null,
          loginCount: sql`${people.loginCount} + 1`,
        })
        .where(eq(people.id, person.id))
        .returning();
      const session = await this.createSession(tx, person.id, meta);
      return { ...session, user: this.mapUser(signedIn!) };
    };
    const result = exec ? await run(exec) : await this.db.transaction(run);
    await this.audit.log({
      action: 'SIGN_IN',
      resource: 'people',
      resourceId: person.id,
      resourceName: person.email,
      actor: result.user,
      details: { ...details, ip: meta.ip },
    });
    return result;
  }

  async getAuthenticatedUser(sessionToken?: string) {
    if (!sessionToken) return null;
    const [row] = await this.db
      .select({ session: sessions, person: people })
      .from(sessions)
      .leftJoin(people, eq(people.id, sessions.personId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(sessionToken)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
        ),
      );
    if (!row) return null;
    const guest = row.session.isGuest;
    if (!guest && !this.canSignIn(row.person)) return null;

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

    return {
      user: guest ? { ...GUEST_USER } : this.mapUser(row.person!),
      expiresAt: row.session.expiresAt,
      csrfToken,
      sessionId: row.session.id,
    };
  }

  async logout(sessionToken?: string) {
    if (!sessionToken) return { ok: true };
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hashToken(sessionToken)), isNull(sessions.revokedAt)));
    return { ok: true };
  }

  /** Signs someone out on every device (but `exceptSessionId`, when given). */
  async revokeAllSessions(personId: string, exceptSessionId?: string, exec: Executor = this.db) {
    if (!UUID_PATTERN.test(personId))
      throw new BadRequestException('Invalid id: record ids are UUIDs');
    await exec
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.personId, personId),
          isNull(sessions.revokedAt),
          exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
        ),
      );
  }

  /** "Look around as a guest": a read-only session with no person, for 12 hours. */
  async startGuestSession(meta: RequestMeta) {
    const session = await this.createSession(this.db, null, meta, GUEST_SESSION_MS);
    await this.audit.log({
      action: 'GUEST_SIGN_IN',
      resource: 'guests',
      resourceId: session.sessionId,
      resourceName: 'Guest',
      details: { ip: meta.ip },
    });
    return { ...session, user: { ...GUEST_USER } };
  }

  // ── Passwords ──────────────────────────────────────────────────────────

  /**
   * Email and password. The message for a wrong email or a wrong password is the same, so the
   * form can't be used to find out who is a member. Wrong passwords count toward a cooldown
   * (see failedAttempt). An account with authenticator codes gets { needsCode, token } and
   * finishes with signInWithCode.
   */
  async signInWithPassword(
    rawEmail: string,
    password: string,
    meta: RequestMeta,
  ): Promise<SignedIn | NeedsCode> {
    const email = normalizeEmail(rawEmail);
    await this.checkIpLimit('password', meta.ip);
    const [person] = await this.db
      .select()
      .from(people)
      .where(and(sql`lower(${people.email}) = ${email}`, isNotNull(people.role)))
      .limit(1);
    if (!this.canSignIn(person) || !person.passwordHash) {
      await verifyPassword(null, password);
      await this.logFailure(person, meta, person ? 'no password or no access' : 'unknown email', {
        email: email.slice(0, 100),
      });
      throw new UnauthorizedException(WRONG_PASSWORD);
    }
    if (person.lockedUntil && person.lockedUntil > new Date()) {
      await this.logFailure(person, meta, 'locked');
      throw new LockedException(person.lockedUntil);
    }
    // Each try uses up one of the allowed attempts before the (slow) password check, so a
    // burst of parallel guesses can't get past the limit.
    const attempt = await this.reserveAttempt(person.id);
    if (attempt === null) throw new TooManyAttemptsException();
    if (!(await verifyPassword(person.passwordHash, password))) {
      await this.logFailure(person, meta, 'wrong password');
      await this.failedAttempt(person, attempt, meta);
      throw new UnauthorizedException(WRONG_PASSWORD);
    }

    if (person.totpEnabledAt) {
      // The right password without a code yet isn't a wrong try.
      await this.releaseAttempt(person.id);
      return { needsCode: true, token: await this.issueToken(person.id, 'code_after_password') };
    }
    return this.startSession(person, meta, { method: 'password' });
  }

  /**
   * The second step for accounts with authenticator codes: a 6-digit code (each works once) or
   * one of the recovery codes (each works once). Wrong codes count toward the cooldown.
   */
  async signInWithCode(token: string, code: string, meta: RequestMeta): Promise<SignedIn> {
    await this.checkIpLimit('code', meta.ip);
    const [row] = await this.db
      .select({ link: signInLinks, person: people })
      .from(signInLinks)
      .innerJoin(people, eq(people.id, signInLinks.personId))
      .where(
        and(
          eq(signInLinks.tokenHash, hashToken(token)),
          inArray(signInLinks.purpose, ['code_after_password', 'code_after_link']),
          isNull(signInLinks.usedAt),
          gt(signInLinks.expiresAt, sql`now()`),
        ),
      );
    const person = row?.person;
    if (!row || !this.canSignIn(person) || !person.totpEnabledAt || !person.totpSecretEnc)
      throw new UnauthorizedException(CODE_STEP_GONE);
    if (person.lockedUntil && person.lockedUntil > new Date()) {
      await this.logFailure(person, meta, 'locked');
      throw new LockedException(person.lockedUntil);
    }
    const attempt = await this.reserveAttempt(person.id);
    if (attempt === null) throw new TooManyAttemptsException();

    const step = matchTotp(this.decrypt(person.totpSecretEnc), code, person.totpLastStep);
    let recovery = person.recoveryCodeHashes ?? [];
    let usedRecovery = false;
    if (step === null) {
      const h = hashRecovery(code);
      if (!recovery.includes(h)) {
        await this.logFailure(person, meta, 'wrong code');
        await this.failedAttempt(person, attempt, meta);
        throw new UnauthorizedException('That code is not right.');
      }
      recovery = recovery.filter((x) => x !== h);
      usedRecovery = true;
    }

    const firstStep = row.link.purpose === 'code_after_link' ? 'link' : 'password';
    return this.db.transaction(async (tx) => {
      // Atomic: of two simultaneous uses, only one gets the row back.
      const [used] = await tx
        .update(signInLinks)
        .set({ usedAt: sql`now()` })
        .where(and(eq(signInLinks.id, row.link.id), isNull(signInLinks.usedAt)))
        .returning({ id: signInLinks.id });
      if (!used) throw new UnauthorizedException(CODE_STEP_GONE);
      // Each code works once: a step at or before the last one is refused (matchTotp), and a
      // recovery code is removed. Conditional, so two requests can't both use one code.
      const [claimed] = await tx
        .update(people)
        .set(usedRecovery ? { recoveryCodeHashes: recovery } : { totpLastStep: step })
        .where(
          and(
            eq(people.id, person.id),
            usedRecovery
              ? sql`${people.recoveryCodeHashes} @> ${JSON.stringify([hashRecovery(code)])}::jsonb`
              : or(isNull(people.totpLastStep), lt(people.totpLastStep, step!)),
          ),
        )
        .returning({ id: people.id });
      if (!claimed) throw new UnauthorizedException('That code is not right.');
      return this.startSession(
        person,
        meta,
        {
          method: 'code',
          firstStep,
          ...(usedRecovery ? { recoveryCode: true, recoveryCodesLeft: recovery.length } : {}),
        },
        {},
        tx,
      );
    });
  }

  /** A short-lived token for the step between a right password and the code. */
  private async issueToken(
    personId: string,
    purpose: SignInTokenPurpose,
    exec: Executor = this.db,
  ) {
    const token = newToken();
    await exec.insert(signInLinks).values({
      tokenHash: hashToken(token),
      personId,
      purpose,
      expiresAt: new Date(Date.now() + CODE_STEP_TTL_MS),
    });
    return token;
  }

  /**
   * Takes one attempt for the account: the attempt's number, or null if none are left (the
   * account is cooling down, or other tries in flight have used them up).
   */
  private async reserveAttempt(personId: string): Promise<number | null> {
    const [row] = await this.db
      .update(people)
      .set({ failedAttempts: sql`${people.failedAttempts} + 1` })
      .where(
        and(
          eq(people.id, personId),
          lt(people.failedAttempts, LOGIN_MAX_FAILURES),
          or(isNull(people.lockedUntil), lte(people.lockedUntil, new Date())),
        ),
      )
      .returning({ failedAttempts: people.failedAttempts });
    return row?.failedAttempts ?? null;
  }

  private async releaseAttempt(personId: string) {
    await this.db
      .update(people)
      .set({ failedAttempts: sql`greatest(${people.failedAttempts} - 1, 0)` })
      .where(eq(people.id, personId));
  }

  /**
   * A wrong password or code on `attempt`: the last allowed one starts a cooldown of 15
   * minutes, doubling with each lockout in a row, up to 24 hours. Temporary on purpose: a
   * permanent lock would let anyone lock a member out by typing wrong passwords.
   */
  private async failedAttempt(person: Person, attempt: number, meta: RequestMeta) {
    if (attempt < LOGIN_MAX_FAILURES) return;
    const minutes = Math.min(LOGIN_LOCK_MINUTES * 2 ** person.lockoutCount, LOGIN_MAX_LOCK_MINUTES);
    const until = new Date(Date.now() + minutes * 60_000);
    await this.db
      .update(people)
      .set({
        failedAttempts: 0,
        lockoutCount: sql`${people.lockoutCount} + 1`,
        lockedUntil: until,
      })
      .where(eq(people.id, person.id));
    await this.audit.log({
      action: 'LOCKOUT',
      resource: 'people',
      resourceId: person.id,
      resourceName: shortName(person) || person.email,
      details: { minutes, until: until.toISOString(), ip: meta.ip },
    });
  }

  /** A failed sign-in, for the Activity log. Never with the password. */
  private async logFailure(
    person: Person | undefined,
    meta: RequestMeta,
    reason: string,
    extra: Record<string, unknown> = {},
  ) {
    await this.audit.log({
      action: 'SIGN_IN_FAILED',
      resource: 'people',
      resourceId: person?.id ?? 'unknown',
      resourceName: person ? shortName(person) || person.email : null,
      details: { reason, ip: meta.ip, ...extra },
    });
  }

  /**
   * Records this attempt, then refuses it if the IP is over the limit. Recording first means a
   * burst of parallel requests can't all pass a count taken before any of them landed.
   */
  private async checkIpLimit(kind: 'password' | 'code', ip: string | undefined) {
    const address = ip ?? 'unknown';
    await this.db.insert(authAttempts).values({ kind, ip: address });
    const [{ recent } = { recent: 0 }] = await this.db
      .select({ recent: count() })
      .from(authAttempts)
      .where(
        and(
          eq(authAttempts.kind, kind),
          eq(authAttempts.ip, address),
          gt(authAttempts.createdAt, new Date(Date.now() - IP_WINDOW_MS)),
        ),
      );
    if (recent > LOGIN_LIMIT_PER_IP) throw new TooManyAttemptsException();
  }

  // ── Password links ─────────────────────────────────────────────────────

  /** Makes a single-use password link token for someone with sign-in access. */
  async createSignInLink(personId: string, createdByEmail?: string) {
    const person = await this.getPerson(personId);
    if (!this.canSignIn(person))
      throw new BadRequestException('Give this person sign-in access first');
    const token = newToken();
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS);
    await this.db.insert(signInLinks).values({
      tokenHash: hashToken(token),
      personId: person.id,
      purpose: 'password',
      expiresAt,
      createdByEmail: createdByEmail ?? null,
    });
    return { token, expiresAt, user: this.mapUser(person) };
  }

  private async findLink(token: string) {
    const [row] = await this.db
      .select({ person: people })
      .from(signInLinks)
      .innerJoin(people, eq(people.id, signInLinks.personId))
      .where(
        and(
          eq(signInLinks.tokenHash, hashToken(token)),
          eq(signInLinks.purpose, 'password'),
          isNull(signInLinks.usedAt),
          gt(signInLinks.expiresAt, sql`now()`),
        ),
      );
    return this.canSignIn(row?.person) ? row.person : null;
  }

  /** Who a link is for, without using it up (so a phone previewing the link can't spoil it). */
  async peekSignInLink(token: string) {
    const person = await this.findLink(token);
    if (!person) return null;
    const user = this.mapUser(person);
    return {
      email: user.email,
      displayName: user.displayName,
      hasPassword: !!person.passwordHash,
    };
  }

  /**
   * Sets the password from an admin's link (first time or reset), uses up the link, signs out
   * the person's other sessions, clears any lockout and signs in here. An account with
   * authenticator codes isn't signed in yet: it gets { needsCode, token }, so a link alone
   * never gets past the authenticator.
   */
  async setPasswordWithLink(
    token: string,
    password: string,
    meta: RequestMeta,
  ): Promise<SignedIn | NeedsCode> {
    const person = await this.findLink(token);
    if (!person) throw new UnauthorizedException(LINK_GONE);
    assertGoodPassword(password, person.email!);
    const passwordHash = await hashPassword(password);

    const result = await this.db.transaction(async (tx) => {
      // Atomic: of two simultaneous uses, only one gets the row back.
      const [link] = await tx
        .update(signInLinks)
        .set({ usedAt: sql`now()` })
        .where(
          and(
            eq(signInLinks.tokenHash, hashToken(token)),
            eq(signInLinks.purpose, 'password'),
            isNull(signInLinks.usedAt),
            gt(signInLinks.expiresAt, sql`now()`),
          ),
        )
        .returning({ id: signInLinks.id });
      if (!link) throw new UnauthorizedException(LINK_GONE);
      const [updated] = await tx
        .update(people)
        .set({
          passwordHash,
          passwordChangedAt: new Date(),
          failedAttempts: 0,
          lockoutCount: 0,
          lockedUntil: null,
        })
        .where(eq(people.id, person.id))
        .returning();
      await this.revokeAllSessions(person.id, undefined, tx);
      if (updated!.totpEnabledAt)
        return {
          needsCode: true as const,
          token: await this.issueToken(person.id, 'code_after_link', tx),
        };
      return updated!;
    });
    await this.audit.log({
      action: 'PASSWORD_SET',
      resource: 'people',
      resourceId: person.id,
      resourceName: shortName(person) || person.email,
      actor: this.mapUser(person),
      details: { via: 'link', ip: meta.ip },
    });
    if ('needsCode' in result) return result;
    return this.startSession(result, meta, { method: 'link' });
  }

  /** Changes your own password (or sets one, if you have none yet); your other sessions end. */
  async changePassword(user: AuthUser, sessionId: string, current: string, next: string) {
    const person = await this.getPerson(user.id);
    if (person.passwordHash && !(await verifyPassword(person.passwordHash, current)))
      throw new BadRequestException('Your current password is not right.');
    assertGoodPassword(next, person.email ?? '');
    await this.db
      .update(people)
      .set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() })
      .where(eq(people.id, person.id));
    await this.revokeAllSessions(person.id, sessionId);
    await this.audit.log({
      action: person.passwordHash ? 'PASSWORD_CHANGE' : 'PASSWORD_SET',
      resource: 'people',
      resourceId: person.id,
      resourceName: shortName(person) || person.email,
      actor: user,
      details: { via: 'account' },
    });
    return { ok: true };
  }

  // ── Authenticator codes (optional) ─────────────────────────────────────

  private get appSecret(): string {
    const secret = config().APP_SECRET;
    if (!secret)
      throw new BadRequestException('Authenticator codes are not set up on this server yet.');
    return secret;
  }

  private decrypt(stored: string) {
    return decryptSecret(stored, this.appSecret);
  }

  /** What the Security card shows. */
  async security(user: AuthUser) {
    const p = await this.getPerson(user.id);
    return {
      hasPassword: !!p.passwordHash,
      passwordChangedAt: p.passwordChangedAt,
      totpEnabled: !!p.totpEnabledAt,
      recoveryCodesLeft: p.totpEnabledAt ? (p.recoveryCodeHashes?.length ?? 0) : null,
      totpAvailable: !!config().APP_SECRET,
    };
  }

  /** Starts setup: a new key for the app to scan. It only takes effect once a code confirms it. */
  async totpStart(user: AuthUser) {
    const p = await this.getPerson(user.id);
    if (p.totpEnabledAt) throw new BadRequestException('Authenticator codes are already on.');
    if (!p.passwordHash) throw new BadRequestException('Set a password first.');
    const secret = newTotpSecret();
    await this.db
      .update(people)
      .set({ totpSecretEnc: encryptSecret(secret, this.appSecret), totpLastStep: null })
      .where(eq(people.id, p.id));
    return { secret, url: otpauthUrl(secret, p.email ?? '') };
  }

  /** Confirms setup with a code from the app; returns 8 recovery codes (shown once). */
  async totpEnable(user: AuthUser, code: string) {
    const p = await this.getPerson(user.id);
    if (p.totpEnabledAt || !p.totpSecretEnc)
      throw new BadRequestException('Start authenticator setup first.');
    const step = matchTotp(this.decrypt(p.totpSecretEnc), code, null);
    if (step === null)
      throw new BadRequestException(
        'That code is not right. Check the time on your phone and try the next one.',
      );
    const codes = newRecoveryCodes();
    await this.db
      .update(people)
      .set({
        totpEnabledAt: new Date(),
        totpLastStep: step,
        recoveryCodeHashes: codes.map(hashRecovery),
      })
      .where(eq(people.id, p.id));
    await this.logSelf('TOTP_ON', p, user);
    return { recoveryCodes: codes };
  }

  /** Turns authenticator codes off (needs your password). */
  async totpDisable(user: AuthUser, password: string) {
    const p = await this.getPerson(user.id);
    if (!(await verifyPassword(p.passwordHash, password)))
      throw new BadRequestException('Your password is not right.');
    await this.clearTotp(p.id);
    await this.logSelf('TOTP_OFF', p, user);
    return { ok: true };
  }

  /** New recovery codes in place of the old ones (needs your password); shown once. */
  async regenerateRecoveryCodes(user: AuthUser, password: string) {
    const p = await this.getPerson(user.id);
    if (!p.totpEnabledAt) throw new BadRequestException('Authenticator codes are off.');
    if (!(await verifyPassword(p.passwordHash, password)))
      throw new BadRequestException('Your password is not right.');
    const codes = newRecoveryCodes();
    await this.db
      .update(people)
      .set({ recoveryCodeHashes: codes.map(hashRecovery) })
      .where(eq(people.id, p.id));
    await this.logSelf('RECOVERY_CODES', p, user);
    return { recoveryCodes: codes };
  }

  private async clearTotp(personId: string) {
    await this.db
      .update(people)
      .set({
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: null,
        recoveryCodeHashes: null,
      })
      .where(eq(people.id, personId));
  }

  private logSelf(action: 'TOTP_ON' | 'TOTP_OFF' | 'RECOVERY_CODES', p: Person, user: AuthUser) {
    return this.audit.log({
      action,
      resource: 'people',
      resourceId: p.id,
      resourceName: shortName(p) || p.email,
      actor: user,
    });
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  /** Ends a cooldown after too many wrong passwords or codes. */
  async unlock(personId: string, actor: AuthUser | undefined) {
    const p = await this.getPerson(personId);
    await this.db
      .update(people)
      .set({ failedAttempts: 0, lockoutCount: 0, lockedUntil: null })
      .where(eq(people.id, p.id));
    await this.audit.log({
      action: 'UNLOCK',
      resource: 'people',
      resourceId: p.id,
      resourceName: shortName(p) || p.email,
      actor,
    });
    return { ok: true };
  }

  /** Turns off someone's authenticator codes (a lost phone) and signs them out everywhere. */
  async resetTotp(personId: string, actor: AuthUser | undefined) {
    const p = await this.getPerson(personId);
    await this.clearTotp(p.id);
    await this.revokeAllSessions(p.id);
    await this.audit.log({
      action: 'TOTP_RESET',
      resource: 'people',
      resourceId: p.id,
      resourceName: shortName(p) || p.email,
      actor,
    });
    return { ok: true };
  }

  /**
   * Gives a person sign-in access with a role, or takes it away (null), which also signs them
   * out everywhere. They need an email address that no one else who signs in uses (enforced by
   * a unique index: a clash is 409, see PgErrorsFilter).
   */
  async setAccess(personId: string, role: Role | null) {
    const person = await this.getPerson(personId);
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
