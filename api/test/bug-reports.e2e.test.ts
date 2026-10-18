import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ISSUE_TRACKER, reporterLabel, type IssueTracker } from '../src/bugs/bug-reports.js';
import { auditLog, bugReports } from '../src/db/schema.js';
import {
  anon,
  as,
  createTestApp,
  resetDb,
  signInAs,
  signInGuest,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let filed: Parameters<IssueTracker['create']>[0][];
let failNext = false;
const tracker: IssueTracker = {
  async create(issue) {
    if (failNext) {
      failNext = false;
      throw new Error('GitHub answered 503: down');
    }
    filed.push(issue);
    return { number: filed.length, url: `https://github.com/x/y/issues/${filed.length}` };
  },
};

beforeAll(async () => {
  t = await createTestApp((m) => m.overrideProvider(ISSUE_TRACKER).useValue(tracker));
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t);
  filed = [];
  failNext = false;
});

const sam = () =>
  signInAs(t, 'viewer', { firstName: 'Sam', lastName: 'Jones', email: 'sam@example.com' });

describe('reporting a problem', () => {
  it('files a public issue signed only with the first name, and keeps who sent it', async () => {
    const who = await sam();
    const { body } = await as(who)
      .post('/api/bug-reports', {
        title: 'Repack date vanishes',
        happened: 'I saved rig 3 and the date went blank. @everyone look',
        expected: 'The date stays',
        page: '/rigs/abc',
      })
      .set('User-Agent', 'Mozilla/5.0 (iPhone)')
      .expect(201);
    expect(body).toMatchObject({ issueNumber: 1, issueUrl: 'https://github.com/x/y/issues/1' });

    const issue = filed[0]!;
    expect(issue.title).toBe('Repack date vanishes');
    expect(issue.labels).toEqual(['bug']);
    expect(issue.body).toContain('Reported in the app by Sam');
    expect(issue.body).toContain('/rigs/abc');
    expect(issue.body).toContain('Version:');
    expect(issue.body).toContain('iPhone');
    // Nothing that identifies them beyond the first name, and no pings.
    expect(issue.body).not.toMatch(/Jones|sam@example\.com/);
    expect(issue.body).not.toContain('@everyone');

    const [row] = await t.db.select().from(bugReports);
    expect(row).toMatchObject({ title: 'Repack date vanishes', issueNumber: 1, personId: who.id });
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.resource, 'bug_reports'));
    expect(entry).toMatchObject({ action: 'CREATE', resource: 'bug_reports' });
  });

  it('signs as "a RigTracker user" without a first name', () => {
    expect(reporterLabel({ firstName: 'Sam Lee' })).toBe('Sam');
    expect(reporterLabel({ firstName: '  ' })).toBe('a RigTracker user');
    expect(reporterLabel(undefined)).toBe('a RigTracker user');
  });

  it('keeps the report when GitHub fails, and admins see it with the reporter', async () => {
    const who = await sam();
    failNext = true;
    const { body } = await as(who)
      .post('/api/bug-reports', { title: 'Crash', happened: 'It crashed' })
      .expect(201);
    expect(body.issueUrl).toBeNull();

    const admin = await signInAs(t, 'admin');
    const list = (await as(admin).get('/api/bug-reports').expect(200)).body;
    expect(list).toEqual([
      expect.objectContaining({
        title: 'Crash',
        reporterName: 'Sam Jones',
        issueUrl: null,
        issueError: expect.stringContaining('503'),
      }),
    ]);
    await as(who).get('/api/bug-reports').expect(403);
    await as(await signInAs(t, 'user'))
      .get('/api/bug-reports')
      .expect(403);
  });

  it('allows 5 reports a day per person', async () => {
    const who = await sam();
    for (let i = 0; i < 5; i++)
      await as(who)
        .post('/api/bug-reports', { title: `Problem ${i}`, happened: 'x' })
        .expect(201);
    await as(who).post('/api/bug-reports', { title: 'One more', happened: 'x' }).expect(429);
  });

  it('needs a title and what happened, and a member sign-in (not a guest)', async () => {
    const who = await sam();
    await as(who).post('/api/bug-reports', { title: 'x', happened: 'y' }).expect(400);
    await as(who).post('/api/bug-reports', { title: 'Something', happened: '' }).expect(400);
    await as(who)
      .post('/api/bug-reports', { title: 'Something', happened: 'y', email: 'a@b.c' })
      .expect(400);
    await anon(t).post('/api/bug-reports', { title: 'Something', happened: 'y' }).expect(401);
    const guest = await signInGuest(t);
    expect([401, 403]).toContain(
      (await as(guest).post('/api/bug-reports', { title: 'Something', happened: 'y' })).status,
    );
    expect(await t.db.select().from(bugReports)).toHaveLength(0);
  });
});
