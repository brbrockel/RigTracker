import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../db/db.js';
import { auditLog } from '../db/schema.js';
import { omit } from '../common/omit.js';

export interface AuditActor {
  id: string;
  email: string;
  displayName: string;
}

export interface LogParams {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SIGN_IN' | 'SIGN_OUT' | 'SIGN_IN_LINK';
  resource: string;
  resourceId: string;
  resourceName?: string | null | undefined;
  actor?: AuditActor | null | undefined;
  details?: Record<string, unknown> | undefined;
  /** For updates: the record before and after the change. */
  before?: unknown;
  after?: unknown;
}

/** Drops values JSON can't hold (undefined) and turns Dates into ISO strings. */
const json = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async log(params: LogParams): Promise<void> {
    try {
      await this.db.insert(auditLog).values({
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        resourceName: params.resourceName ?? null,
        userId: params.actor?.id ?? null,
        userEmail: params.actor?.email ?? null,
        userDisplayName: params.actor?.displayName ?? null,
        details: params.details ?? null,
        before: json(params.before),
        after: json(params.after),
      });
    } catch (err) {
      // Never let audit failures break the main request
      console.error('[AuditService] Failed to write log entry:', err);
    }
  }

  async findAll(opts: { resource?: string; action?: string; skip?: number; limit?: number }) {
    const filters: SQL[] = [];
    if (opts.resource) filters.push(eq(auditLog.resource, opts.resource));
    if (opts.action) filters.push(eq(auditLog.action, opts.action));
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow, rows] = await Promise.all([
      this.db.select({ n: count() }).from(auditLog).where(where),
      this.db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .offset(opts.skip ?? 0)
        .limit(opts.limit ?? 50),
    ]);
    const logs = rows.map((entry) => omit(entry, 'legacyId'));
    return { total: totalRow[0]?.n ?? 0, logs };
  }
}
