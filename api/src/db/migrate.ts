import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config.js';
import { createDb, createPool } from './db.js';

/** api/drizzle, from either src/db (tests) or dist/db (built). */
export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/** Applies any migrations not yet applied (drizzle records them in drizzle.__drizzle_migrations). */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = createPool(databaseUrl);
  try {
    await migrate(createDb(pool), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}

// The API applies migrations itself at start-up (main.ts); this is for running them by hand:
// node dist/db/migrate.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMigrations(loadConfig().DATABASE_URL);
  console.log('Migrations applied');
}
