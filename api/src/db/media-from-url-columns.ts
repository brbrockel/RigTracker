import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import type { Executor } from './db.js';
import { MIGRATIONS_DIR } from './migrate.js';

/** Migration 0004: copies the 1.x photo URL columns into media, for owners with no media yet. */
export const MEDIA_FROM_URL_COLUMNS = path.join(MIGRATIONS_DIR, '0004_media_from_url_columns.sql');

/**
 * Runs migration 0004's data move again: rigs, gear and events that have photos in the old
 * columns but no media rows get them. Safe to re-run. Returns how many media rows it added.
 */
export async function copyUrlColumnsToMedia(db: Executor): Promise<number> {
  const statements = fs
    .readFileSync(MEDIA_FROM_URL_COLUMNS, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  let added = 0;
  for (const statement of statements) {
    const result = await db.execute(sql.raw(statement));
    added += result.rowCount ?? 0;
  }
  return added;
}
