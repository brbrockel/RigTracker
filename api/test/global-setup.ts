import * as fs from 'node:fs';
import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';

/**
 * Starts every run with an empty, fully migrated test database (created if missing) and an
 * empty uploads folder. Tests then reset the tables with TRUNCATE (see helpers.resetDb).
 */
export default async function setup(): Promise<() => Promise<void>> {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!/test/.test(dbName)) throw new Error(`Refusing to reset a non-test database: ${dbName}`);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    // Dropped and created afresh, so every run also checks that the migrations apply from empty.
    await client.query(`drop database if exists "${dbName}" with (force)`);
    await client.query(`create database "${dbName}"`);
  } finally {
    await client.end();
  }
  await runMigrations(url.toString());

  const uploads = process.env.UPLOADS_DIR!;
  fs.rmSync(uploads, { recursive: true, force: true });
  fs.mkdirSync(uploads, { recursive: true });
  return async () => {
    fs.rmSync(uploads, { recursive: true, force: true });
  };
}
