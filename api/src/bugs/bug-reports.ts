import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Module,
  Post,
  Req,
} from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthedRequest, AuthUser } from '../auth/auth-user.js';
import { RequireRoles } from '../auth/roles.decorator.js';
import { AuditService } from '../audit/audit.service.js';
import { ZodPipe } from '../common/validation.js';
import { config, type Config } from '../config.js';
import { DB, type Database } from '../db/db.js';
import { bugReports, people } from '../db/schema.js';
import { shortName } from '../people/person-view.js';

/** Where reports become issues. Swapped out in tests. */
export interface IssueTracker {
  create(issue: { title: string; body: string; labels: string[] }): Promise<{
    number: number;
    url: string;
  }>;
}
export const ISSUE_TRACKER = Symbol('ISSUE_TRACKER');

/** GitHub Issues with a fine-grained token, or nothing when there's no token. */
export function githubIssues(c: Config): IssueTracker | null {
  if (!c.GITHUB_TOKEN) return null;
  return {
    async create(issue) {
      const res = await fetch(`https://api.github.com/repos/${c.GITHUB_ISSUES_REPO}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${c.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'RigTracker',
        },
        body: JSON.stringify(issue),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { number: number; html_url: string };
      return { number: body.number, url: body.html_url };
    },
  };
}

export const REPORTS_PER_DAY = 5;

export const Report = z
  .object({
    title: z.string().trim().min(3).max(120),
    happened: z.string().trim().min(1).max(4000),
    expected: z.string().trim().max(2000).optional(),
    page: z.string().trim().max(300).optional(),
  })
  .strict();

/** What the public issue calls the reporter: their first name. Never more. */
export function reporterLabel(p: { firstName: string | null } | undefined): string {
  return p?.firstName?.trim().split(/\s+/)[0] || 'a RigTracker user';
}

/** Stops "@someone" in a report from pinging GitHub users. */
const quiet = (text: string) => text.replace(/@/g, '@​');

@Injectable()
export class BugReportsService {
  private readonly log = new Logger('BugReports');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ISSUE_TRACKER) private readonly tracker: IssueTracker | null,
    private readonly audit: AuditService,
  ) {}

  async report(user: AuthUser, input: z.infer<typeof Report>, userAgent: string | undefined) {
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(bugReports)
      .where(
        and(
          eq(bugReports.personId, user.id),
          gt(bugReports.createdAt, new Date(Date.now() - 24 * 3600 * 1000)),
        ),
      );
    if (n >= REPORTS_PER_DAY)
      throw new HttpException(
        `That's ${REPORTS_PER_DAY} reports today. Thanks! Try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const [me] = await this.db
      .select({ firstName: people.firstName })
      .from(people)
      .where(eq(people.id, user.id));
    const version = config().APP_VERSION;
    const body = [
      '**What happened**',
      '',
      quiet(input.happened),
      ...(input.expected ? ['', '**What they expected**', '', quiet(input.expected)] : []),
      '',
      '---',
      `Reported in the app by ${quiet(reporterLabel(me))}`,
      `Page: \`${(input.page ?? '?').replace(/`/g, '')}\` · Version: \`${version}\``,
      `Browser: ${quiet((userAgent ?? 'unknown').slice(0, 300))}`,
    ].join('\n');

    let issue: { number: number; url: string } | null = null;
    let issueError: string | null = null;
    if (!this.tracker) issueError = 'No GitHub token set; kept in the app only.';
    else {
      try {
        issue = await this.tracker.create({ title: quiet(input.title), body, labels: ['bug'] });
      } catch (err) {
        issueError = (err as Error).message.slice(0, 500);
        this.log.error(`Couldn't file a GitHub issue: ${issueError}`);
      }
    }

    const [row] = await this.db
      .insert(bugReports)
      .values({
        personId: user.id,
        title: input.title,
        happened: input.happened,
        expected: input.expected || null,
        page: input.page || null,
        userAgent: userAgent?.slice(0, 300) ?? null,
        appVersion: version,
        issueNumber: issue?.number ?? null,
        issueUrl: issue?.url ?? null,
        issueError,
      })
      .returning();
    await this.audit.log({
      action: 'CREATE',
      resource: 'bug_reports',
      resourceId: row!.id,
      resourceName: input.title,
      actor: user,
      after: { title: input.title, issueNumber: issue?.number ?? null },
    });
    return { id: row!.id, issueUrl: issue?.url ?? null, issueNumber: issue?.number ?? null };
  }

  /** Admins: recent reports with who sent them. */
  async list() {
    const rows = await this.db
      .select({
        id: bugReports.id,
        title: bugReports.title,
        happened: bugReports.happened,
        expected: bugReports.expected,
        page: bugReports.page,
        appVersion: bugReports.appVersion,
        issueNumber: bugReports.issueNumber,
        issueUrl: bugReports.issueUrl,
        issueError: bugReports.issueError,
        createdAt: bugReports.createdAt,
        personId: bugReports.personId,
        firstName: people.firstName,
        lastName: people.lastName,
      })
      .from(bugReports)
      .leftJoin(people, eq(people.id, bugReports.personId))
      .orderBy(desc(bugReports.createdAt))
      .limit(50);
    return rows.map(({ firstName, lastName, ...r }) => ({
      ...r,
      reporterName: shortName({ firstName, lastName }) || null,
    }));
  }
}

/** /api/bug-reports: anyone signed in reports a problem (not guests); admins list them. */
@Controller('bug-reports')
export class BugReportsController {
  constructor(private readonly reports: BugReportsService) {}

  @Post()
  report(@Req() req: AuthedRequest, @Body(new ZodPipe(Report)) body: z.infer<typeof Report>) {
    return this.reports.report(req.authUser!, body, req.header('user-agent'));
  }

  @Get()
  @RequireRoles('admin')
  list() {
    return this.reports.list();
  }
}

@Module({
  controllers: [BugReportsController],
  providers: [
    BugReportsService,
    { provide: ISSUE_TRACKER, useFactory: () => githubIssues(config()) },
  ],
})
export class BugReportsModule {}
