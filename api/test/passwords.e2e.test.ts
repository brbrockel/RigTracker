import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { passwordProblem, verifyPassword } from '../src/auth/password.js';
import { currentStep, totpAt } from '../src/auth/totp.js';
import { auditLog, people, sessions, signInLinks } from '../src/db/schema.js';
import {
  TEST_PASSWORD,
  anon,
  as,
  createLinkToken,
  createPerson,
  createTestApp,
  givePassword,
  newAgent,
  resetDb,
  sessionCookie,
  signIn,
  signInAs,
  type SignedIn,
  type TestApp,
} from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => resetDb(t));

const WRONG = 'Email or password is incorrect';

const personRow = async (id: string) =>
  (await t.db.select().from(people).where(eq(people.id, id)))[0]!;

const auditOf = async (action: string) =>
  t.db.select().from(auditLog).where(eq(auditLog.action, action));

/** Signs in with email and password from a fresh IP. */
const passwordSignIn = (email: string | undefined, password: string) =>
  anon(t).post('/api/auth/sign-in', { email, password });

/** A code that isn't valid for the secret around now. */
function wrongCode(secret: string): string {
  const step = currentStep();
  const valid = new Set([-1, 0, 1, 2].map((d) => totpAt(secret, step + d)));
  for (let n = 0; ; n++) {
    const code = String(n).padStart(6, '0');
    if (!valid.has(code)) return code;
  }
}

/** Turns authenticator codes on for a signed-in person; returns the key and recovery codes. */
async function enableTotp(who: SignedIn) {
  const start = await as(who).post('/api/auth/totp/start').expect(201);
  expect(start.body.url).toMatch(/^otpauth:\/\/totp\/RigTracker%3A.*issuer=RigTracker/);
  const secret: string = start.body.secret;
  const res = await as(who)
    .post('/api/auth/totp/enable', { code: totpAt(secret, currentStep()) })
    .expect(201);
  return { secret, recoveryCodes: res.body.recoveryCodes as string[] };
}

describe('password rules (NIST)', () => {
  it.each([
    ['too short', 'abc12345', /at least 10/],
    ['too long', 'x'.repeat(60) + 'y'.repeat(69), /at most 128/],
    ['common', 'password123', /too common/],
    ['common, any case', 'QwertyUiop', /too common/],
    ['the email', 'ada.lovelace@example.com', /email/],
    ['containing the email name', 'my-ada.lovelace-pass', /email/],
    ['one character repeated', 'kkkkkkkkkkkk', /repeat/],
  ])('refuses a password that is %s', async (_name, password, why) => {
    expect(passwordProblem(password, 'ada.lovelace@example.com')).toMatch(why);
    const p = await createPerson(t, { email: 'ada.lovelace@example.com', roles: ['user'] });
    const token = await createLinkToken(t, p.id);
    const res = await anon(t).post('/api/auth/link/redeem', { token, password }).expect(400);
    expect(res.body.message).toMatch(why);
    expect((await personRow(p.id)).passwordHash).toBeNull();
  });

  it('accepts a long passphrase, stored only as an Argon2id hash', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    const token = await createLinkToken(t, p.id);
    await anon(t)
      .post('/api/auth/link/redeem', { token, password: 'plum tractor sideways' })
      .expect(201);
    const row = await personRow(p.id);
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(row.passwordChangedAt).toBeTruthy();
    expect(await verifyPassword(row.passwordHash, 'plum tractor sideways')).toBe(true);
    expect(JSON.stringify(await auditOf('PASSWORD_SET'))).not.toContain('plum tractor');
  });

  it('the API never returns password, authenticator or lockout internals', async () => {
    const admin = await signInAs(t, 'admin');
    await enableTotp(admin);
    const person = (await as(admin).get(`/api/people/${admin.id}`).expect(200)).body;
    expect(person).toMatchObject({ hasPassword: true, totpEnabled: true, lockedUntil: null });
    for (const key of [
      'passwordHash',
      'failedAttempts',
      'lockoutCount',
      'totpSecretEnc',
      'totpEnabledAt',
      'totpLastStep',
      'recoveryCodeHashes',
    ])
      expect(person).not.toHaveProperty(key);
    const list = (await as(admin).get('/api/people').expect(200)).body;
    expect(JSON.stringify(list)).not.toContain('argon2');
  });
});

describe('signing in with a password', () => {
  it('works with the right email (any case) and password', async () => {
    const p = await createPerson(t, { email: 'grace@example.com', roles: ['user'] });
    await givePassword(t, p.id);
    const { agent } = newAgent(t);
    const res = await agent
      .post('/api/auth/sign-in')
      .send({ email: '  Grace@Example.COM ', password: TEST_PASSWORD })
      .expect(201);
    expect(res.body).toMatchObject({ authenticated: true, user: { id: p.id } });
    expect(sessionCookie(res)).toBeTruthy();
    await agent.get('/api/rigs').expect(200);
    const [entry] = await auditOf('SIGN_IN');
    expect(entry).toMatchObject({ resourceId: p.id, details: { method: 'password' } });
    expect((await personRow(p.id)).loginCount).toBe(1);
  });

  it('gives the same answer for a wrong email, a wrong password, no password and no access', async () => {
    const withPassword = await createPerson(t, { roles: ['user'] });
    await givePassword(t, withPassword.id);
    const noPassword = await createPerson(t, { roles: ['user'] });
    const noAccess = await createPerson(t, { roles: [] });
    await givePassword(t, noAccess.id);
    const disabled = await createPerson(t, { roles: ['admin'], isActive: false });
    await givePassword(t, disabled.id);

    const answers = [
      await passwordSignIn('nobody@example.com', TEST_PASSWORD),
      await passwordSignIn(withPassword.email, 'not the password at all'),
      await passwordSignIn(noPassword.email, TEST_PASSWORD),
      await passwordSignIn(noAccess.email, TEST_PASSWORD),
      await passwordSignIn(disabled.email, TEST_PASSWORD),
    ];
    for (const res of answers) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, message: WRONG, error: 'Unauthorized' });
      expect(sessionCookie(res)).toBeUndefined();
    }
  });

  it('records failed sign-ins without the password', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    await givePassword(t, p.id);
    await passwordSignIn(p.email, 'a secret wrong guess').expect(401);
    await passwordSignIn('stranger@example.com', 'another secret guess').expect(401);
    const entries = await auditOf('SIGN_IN_FAILED');
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.resourceId === p.id)?.details).toMatchObject({
      reason: 'wrong password',
    });
    expect(entries.find((e) => e.resourceId === 'unknown')?.details).toMatchObject({
      reason: 'unknown email',
      email: 'stranger@example.com',
    });
    expect(JSON.stringify(entries)).not.toMatch(/secret wrong guess|another secret guess/);
  });

  it.each([
    ['missing password', { email: 'a@example.com' }],
    ['empty password', { email: 'a@example.com', password: '' }],
    ['an operator object', { email: { $gt: '' }, password: 'whatever it is' }],
  ])('a malformed body (%s) is 400', async (_name, body) => {
    await anon(t).post('/api/auth/sign-in', body).expect(400);
  });

  it('someone without a password can still only get in with a password link', async () => {
    const p = await createPerson(t, { roles: ['admin'] });
    await passwordSignIn(p.email, '').expect(400);
    await passwordSignIn(p.email, 'anything at all here').expect(401);
    const token = await createLinkToken(t, p.id);
    await anon(t)
      .post('/api/auth/link/redeem', { token, password: 'plum tractor sideways' })
      .expect(201);
    await passwordSignIn(p.email, 'plum tractor sideways').expect(201);
  });
});

describe('lockouts', () => {
  async function lockedPerson(lockoutCount = 0) {
    const p = await createPerson(t, { roles: ['user'], lockoutCount });
    await givePassword(t, p.id);
    for (let i = 0; i < 5; i++) await passwordSignIn(p.email, 'wrong password!!').expect(401);
    return p;
  }

  it('5 wrong passwords lock the account for 15 minutes, even for the right password', async () => {
    const p = await lockedPerson();
    const res = await passwordSignIn(p.email, TEST_PASSWORD).expect(429);
    expect(res.body.message).toMatch(/Try again in 15 minutes/);
    const row = await personRow(p.id);
    const minutes = (row.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
    expect(row.lockoutCount).toBe(1);
    expect(row.failedAttempts).toBe(0);
    const [entry] = await auditOf('LOCKOUT');
    expect(entry).toMatchObject({ resourceId: p.id, details: { minutes: 15 } });
  });

  it('4 wrong passwords then the right one signs in and resets the count', async () => {
    const p = await createPerson(t, { roles: ['user'], lockoutCount: 2 });
    await givePassword(t, p.id);
    for (let i = 0; i < 4; i++) await passwordSignIn(p.email, 'wrong password!!').expect(401);
    await passwordSignIn(p.email, TEST_PASSWORD).expect(201);
    const row = await personRow(p.id);
    expect(row).toMatchObject({ failedAttempts: 0, lockoutCount: 0, lockedUntil: null });
  });

  it('each lockout in a row doubles the next, up to 24 hours', async () => {
    const third = await lockedPerson(2);
    expect((await personRow(third.id)).lockedUntil!.getTime() - Date.now()).toBeGreaterThan(
      59 * 60_000,
    );
    const many = await lockedPerson(12);
    const ms = (await personRow(many.id)).lockedUntil!.getTime() - Date.now();
    expect(ms).toBeGreaterThan(23.9 * 3600_000);
    expect(ms).toBeLessThanOrEqual(24 * 3600_000);
  });

  it('the account opens again once the time is up', async () => {
    const p = await lockedPerson();
    await t.db
      .update(people)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(people.id, p.id));
    await passwordSignIn(p.email, TEST_PASSWORD).expect(201);
    expect((await personRow(p.id)).lockoutCount).toBe(0);
  });

  it('an admin sees "locked until" and can unlock; others cannot', async () => {
    const admin = await signInAs(t, 'admin');
    const user = await signInAs(t, 'user');
    const p = await lockedPerson();
    const seen = (await as(admin).get(`/api/people/${p.id}`).expect(200)).body;
    expect(new Date(seen.lockedUntil).getTime()).toBeGreaterThan(Date.now());
    await as(user).post(`/api/auth/people/${p.id}/unlock`).expect(403);
    await as(admin).post(`/api/auth/people/${p.id}/unlock`).expect(201, { ok: true });
    expect((await as(admin).get(`/api/people/${p.id}`)).body.lockedUntil).toBeNull();
    await passwordSignIn(p.email, TEST_PASSWORD).expect(201);
    const [entry] = await auditOf('UNLOCK');
    expect(entry).toMatchObject({ resourceId: p.id, userId: admin.id });
  });

  it('allows 30 password attempts per IP in 15 minutes, across accounts', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    await givePassword(t, p.id);
    const { agent } = newAgent(t);
    for (let i = 0; i < 30; i++)
      await agent
        .post('/api/auth/sign-in')
        .send({ email: `guess${i}@example.com`, password: 'guessing again' })
        .expect(401);
    const res = await agent
      .post('/api/auth/sign-in')
      .send({ email: p.email, password: TEST_PASSWORD })
      .expect(429);
    expect(res.body.message).toMatch(/Too many sign-in attempts/);
    // Another visitor is not affected.
    await passwordSignIn(p.email, TEST_PASSWORD).expect(201);
  });
});

describe('authenticator codes', () => {
  it('setup: the key is stored encrypted, a code confirms it, 8 recovery codes are shown once', async () => {
    const who = await signInAs(t, 'user');
    expect((await as(who).get('/api/auth/security').expect(200)).body).toMatchObject({
      hasPassword: true,
      totpEnabled: false,
      recoveryCodesLeft: null,
      totpAvailable: true,
    });
    const start = await as(who).post('/api/auth/totp/start').expect(201);
    const row = await personRow(who.id);
    expect(row.totpSecretEnc).toBeTruthy();
    expect(row.totpSecretEnc).not.toContain(start.body.secret);
    expect(row.totpEnabledAt).toBeNull();
    await as(who)
      .post('/api/auth/totp/enable', { code: wrongCode(start.body.secret) })
      .expect(400);
    const res = await as(who)
      .post('/api/auth/totp/enable', { code: totpAt(start.body.secret, currentStep()) })
      .expect(201);
    expect(res.body.recoveryCodes).toHaveLength(8);
    const stored = (await personRow(who.id)).recoveryCodeHashes!;
    expect(stored).toHaveLength(8);
    expect(JSON.stringify(stored)).not.toContain(res.body.recoveryCodes[0]);
    expect((await as(who).get('/api/auth/security')).body).toMatchObject({
      totpEnabled: true,
      recoveryCodesLeft: 8,
    });
    await as(who).post('/api/auth/totp/start').expect(400);
    expect(await auditOf('TOTP_ON')).toHaveLength(1);
  });

  it('signing in asks for a code; each code works once', async () => {
    const who = await signInAs(t, 'user');
    const { secret } = await enableTotp(who);

    const first = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    expect(first.body).toEqual({ needsCode: true, token: expect.stringMatching(/^[\w-]{43}$/) });
    expect(sessionCookie(first)).toBeUndefined();

    const code = totpAt(secret, currentStep() + 1);
    const { agent } = newAgent(t);
    const ok = await agent
      .post('/api/auth/sign-in/code')
      .send({ token: first.body.token, code })
      .expect(201);
    expect(ok.body).toMatchObject({ authenticated: true, user: { id: who.id } });
    await agent.get('/api/rigs').expect(200);
    const signIns = await auditOf('SIGN_IN');
    expect(signIns.at(-1)?.details).toMatchObject({ method: 'code', firstStep: 'password' });

    // The step token is used up, and the same code doesn't work again.
    await anon(t).post('/api/auth/sign-in/code', { token: first.body.token, code }).expect(401);
    const again = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    const replay = await anon(t)
      .post('/api/auth/sign-in/code', { token: again.body.token, code })
      .expect(401);
    expect(replay.body.message).toBe('That code is not right.');
  });

  it('a recovery code works once in place of a code', async () => {
    const who = await signInAs(t, 'user');
    const { recoveryCodes } = await enableTotp(who);
    const step1 = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    await anon(t)
      .post('/api/auth/sign-in/code', {
        token: step1.body.token,
        code: recoveryCodes[3]!.toUpperCase(),
      })
      .expect(201);
    expect((await personRow(who.id)).recoveryCodeHashes).toHaveLength(7);
    const step2 = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    await anon(t)
      .post('/api/auth/sign-in/code', { token: step2.body.token, code: recoveryCodes[3] })
      .expect(401);
  });

  it('wrong codes count toward the lockout', async () => {
    const who = await signInAs(t, 'user');
    const { secret } = await enableTotp(who);
    const step = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    for (let i = 0; i < 5; i++)
      await anon(t)
        .post('/api/auth/sign-in/code', { token: step.body.token, code: wrongCode(secret) })
        .expect(401);
    await anon(t)
      .post('/api/auth/sign-in/code', {
        token: step.body.token,
        code: totpAt(secret, currentStep() + 1),
      })
      .expect(429);
    await passwordSignIn(who.email, TEST_PASSWORD).expect(429);
    expect(await auditOf('LOCKOUT')).toHaveLength(1);
  });

  it('an expired code step is refused', async () => {
    const who = await signInAs(t, 'user');
    const { secret } = await enableTotp(who);
    const step = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    await t.db
      .update(signInLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(signInLinks.personId, who.id));
    await anon(t)
      .post('/api/auth/sign-in/code', {
        token: step.body.token,
        code: totpAt(secret, currentStep() + 1),
      })
      .expect(401);
  });

  it('a password link alone does not get past the authenticator', async () => {
    const who = await signInAs(t, 'user');
    const { secret } = await enableTotp(who);
    const token = await createLinkToken(t, who.id);
    const res = await anon(t)
      .post('/api/auth/link/redeem', { token, password: 'plum tractor sideways' })
      .expect(201);
    expect(res.body).toEqual({ needsCode: true, token: expect.any(String) });
    expect(sessionCookie(res)).toBeUndefined();
    // The password is set and the link used up; the earlier session is signed out.
    await anon(t).post('/api/auth/link/check', { token }).expect(404);
    await as(who).get('/api/rigs').expect(401);
    await anon(t)
      .post('/api/auth/sign-in/code', { token: res.body.token, code: wrongCode(secret) })
      .expect(401);
    const ok = await anon(t)
      .post('/api/auth/sign-in/code', {
        token: res.body.token,
        code: totpAt(secret, currentStep() + 1),
      })
      .expect(201);
    expect(ok.body.authenticated).toBe(true);
    expect((await auditOf('SIGN_IN')).at(-1)?.details).toMatchObject({
      method: 'code',
      firstStep: 'link',
    });
  });

  it('turning it off needs the password', async () => {
    const who = await signInAs(t, 'user');
    await enableTotp(who);
    await as(who).post('/api/auth/totp/disable', { password: 'not my password' }).expect(400);
    await as(who).post('/api/auth/totp/disable', { password: TEST_PASSWORD }).expect(201);
    const row = await personRow(who.id);
    expect(row).toMatchObject({
      totpSecretEnc: null,
      totpEnabledAt: null,
      recoveryCodeHashes: null,
    });
    const res = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    expect(res.body.authenticated).toBe(true);
    expect(await auditOf('TOTP_OFF')).toHaveLength(1);
  });

  it('new recovery codes replace the old ones (needs the password)', async () => {
    const who = await signInAs(t, 'user');
    const { recoveryCodes } = await enableTotp(who);
    await as(who)
      .post('/api/auth/totp/recovery-codes', { password: 'not my password' })
      .expect(400);
    const res = await as(who)
      .post('/api/auth/totp/recovery-codes', { password: TEST_PASSWORD })
      .expect(201);
    expect(res.body.recoveryCodes).toHaveLength(8);
    const step = await passwordSignIn(who.email, TEST_PASSWORD).expect(201);
    await anon(t)
      .post('/api/auth/sign-in/code', { token: step.body.token, code: recoveryCodes[0] })
      .expect(401);
    await anon(t)
      .post('/api/auth/sign-in/code', { token: step.body.token, code: res.body.recoveryCodes[0] })
      .expect(201);
    expect(await auditOf('RECOVERY_CODES')).toHaveLength(1);
  });

  it('an admin can reset someone’s authenticator, which signs them out everywhere', async () => {
    const admin = await signInAs(t, 'admin');
    const user = await signInAs(t, 'user');
    await enableTotp(user);
    await as(user).post(`/api/auth/people/${admin.id}/reset-authenticator`).expect(403);
    await as(admin).post(`/api/auth/people/${user.id}/reset-authenticator`).expect(201);
    await as(user).get('/api/rigs').expect(401);
    expect((await personRow(user.id)).totpEnabledAt).toBeNull();
    expect((await passwordSignIn(user.email, TEST_PASSWORD).expect(201)).body.authenticated).toBe(
      true,
    );
    expect(await auditOf('TOTP_RESET')).toHaveLength(1);
  });
});

describe('changing your password', () => {
  it('needs the current password, checks the rules and signs out the other sessions', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    const laptop = await signIn(t, p.id);
    const phone = await signIn(t, p.id);
    await as(laptop)
      .post('/api/auth/password', { current: 'not it at all', password: 'plum tractor sideways' })
      .expect(400);
    await as(laptop)
      .post('/api/auth/password', { current: TEST_PASSWORD, password: 'password123' })
      .expect(400);
    await as(laptop)
      .post('/api/auth/password', { current: TEST_PASSWORD, password: 'plum tractor sideways' })
      .expect(201);
    await as(laptop).get('/api/rigs').expect(200);
    await as(phone).get('/api/rigs').expect(401);
    await passwordSignIn(laptop.email, TEST_PASSWORD).expect(401);
    await passwordSignIn(laptop.email, 'plum tractor sideways').expect(201);
    const [entry] = await auditOf('PASSWORD_CHANGE');
    expect(entry).toMatchObject({ resourceId: p.id, userId: p.id });
    expect(JSON.stringify(entry)).not.toContain('plum tractor');
  });

  it('someone signed in without a password yet can set one', async () => {
    const p = await createPerson(t, { roles: ['viewer'] });
    const who = await signIn(t, p.id);
    await t.db.update(people).set({ passwordHash: null }).where(eq(people.id, p.id));
    expect((await as(who).get('/api/auth/security')).body.hasPassword).toBe(false);
    await as(who).post('/api/auth/totp/start').expect(400);
    await as(who).post('/api/auth/password', { password: 'plum tractor sideways' }).expect(201);
    expect(await auditOf('PASSWORD_SET')).toHaveLength(1);
  });

  it('only the session row of this device survives', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    const a = await signIn(t, p.id);
    await signIn(t, p.id);
    await as(a)
      .post('/api/auth/password', { current: TEST_PASSWORD, password: 'plum tractor sideways' })
      .expect(201);
    const live = (await t.db.select().from(sessions).where(eq(sessions.personId, p.id))).filter(
      (s) => !s.revokedAt,
    );
    expect(live).toHaveLength(1);
  });
});

describe('session cookie on password sign-in', () => {
  it('is HttpOnly, SameSite=Lax and lasts 30 days', async () => {
    const p = await createPerson(t, { roles: ['user'] });
    await givePassword(t, p.id);
    const res = await request(t.app.getHttpServer())
      .post('/api/auth/sign-in')
      .set('CF-Connecting-IP', '10.200.0.1')
      .send({ email: p.email, password: TEST_PASSWORD })
      .expect(201);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const maxAge = Number(cookie.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThan(29 * 86400);
  });
});
