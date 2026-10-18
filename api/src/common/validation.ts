import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Validates a request body or query with a zod schema: `@Body(new ZodPipe(schema))`. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const first = result.error.issues[0];
      throw new BadRequestException({
        message: first
          ? `${first.path.join('.') || 'request'}: ${first.message}`
          : 'Invalid request',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

// ── Field types shared by the record schemas ────────────────────────────────
// Blank values ('' or null) clear a field on update; they're stored as null.

const blankToNull = (v: unknown) => (v === '' ? null : v);

/** Optional text, trimmed, up to max characters; '' or null clears it. */
export const text = (max = 200) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? blankToNull(v.trim()) : v),
    z.string().max(max).nullable().optional(),
  );

/** yyyy-mm-dd, or a full ISO timestamp (its UTC date is kept). */
export const dateOnly = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((s) => (s.length === 10 ? s : new Date(s).toISOString().slice(0, 10)));

/** A date (stored as a date, returned as yyyy-mm-dd); '' or null clears it. */
export const date = () => z.preprocess(blankToNull, dateOnly.nullable().optional());

/** Record ids are UUIDs (any version: Postgres accepts them all). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidString = z.string().regex(UUID_PATTERN, 'must be a record id (a UUID)');

/** Another record's id; '' or null clears it. */
export const ref = () => z.preprocess(blankToNull, uuidString.nullable().optional());

/** Checks an :id route parameter: `@Param('id', IdPipe) id: string`. Malformed ids are 400. */
export class IdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value))
      throw new BadRequestException('Invalid id: record ids are UUIDs');
    return value.toLowerCase();
  }
}

/** A photo or video: one of our uploads, or an https link. */
export const mediaUrlSchema = z
  .string()
  .max(500)
  .refine(
    (u) => u.startsWith('/uploads/') || /^https:\/\/[^\s]+$/.test(u),
    'must be an uploaded file or an https link',
  );

export const mediaUrl = () => z.preprocess(blankToNull, mediaUrlSchema.nullable().optional());

/** Free-form extra fields: a flat object of short strings, numbers or booleans. */
export const customFields = () =>
  z
    .record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
    .refine((o) => Object.keys(o).length <= 50, 'too many custom fields')
    .optional();

/** Query-string values must be plain strings (never objects like ?id[$ne]=x). */
export const queryString = () => z.string().max(100).optional();

/** An optional id filter in a query string; '' means no filter. */
export const queryId = () => z.preprocess((v) => (v === '' ? undefined : v), uuidString.optional());

/** Drops undefined keys so an update only touches what was sent. */
export function defined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
