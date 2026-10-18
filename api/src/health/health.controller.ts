import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/public.decorator.js';
import { DB, type Database } from '../db/db.js';

/** For the container healthcheck and for showing which release is running. */
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    const version = process.env.APP_VERSION || 'dev';
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ ok: false, version, database: 'unreachable' });
    }
    return { ok: true, version };
  }
}
