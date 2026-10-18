import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';
import { loadConfig } from '../config.js';
import { createDb, createPool, DB, PG_POOL } from './db.js';

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => createPool(loadConfig().DATABASE_URL) },
    { provide: DB, inject: [PG_POOL], useFactory: createDb },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
