import { z } from 'zod';
import { NOTICE_AUDIENCES } from '../db/schema.js';
import { uuidString } from '../common/validation.js';
import { AUTO_KEY } from './banners.js';

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Optional, up to 100 characters; '' or null for none. */
const title = z.preprocess(blankToNull, z.string().trim().max(100).nullable().optional());
const body = z.string().trim().min(1, 'write the notice').max(1000);
/**
 * When it stops showing as a banner: an ISO time, or a day (the end of that day, UTC);
 * null for the default (a week, two days for one person; pinned: until dismissed).
 */
const bannerUntil = z.preprocess(
  blankToNull,
  z
    .union([z.iso.date(), z.iso.datetime({ offset: true })])
    .transform((s) => new Date(s.length === 10 ? `${s}T23:59:59.999Z` : s))
    .nullable()
    .optional(),
);

export const NewNotice = z
  .object({
    title,
    body,
    audience: z.enum(NOTICE_AUDIENCES).default('everyone'),
    recipientId: uuidString.optional(),
    pinned: z.boolean().default(false),
    bannerUntil,
  })
  .strict()
  .refine((n) => n.audience !== 'person' || n.recipientId, {
    message: 'pick the person',
    path: ['recipientId'],
  })
  .refine((n) => n.audience === 'person' || !n.recipientId, {
    message: 'only a notice to one person has a recipient',
    path: ['recipientId'],
  });
export type NewNotice = z.infer<typeof NewNotice>;

/** Who it's for can't change; post a new one instead. */
export const EditNotice = z
  .object({ title, body: body.optional(), pinned: z.boolean().optional(), bannerUntil })
  .strict();
export type EditNotice = z.infer<typeof EditNotice>;

export const ListQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

export const Ids = z.object({ ids: z.array(uuidString).min(1).max(100) }).strict();

export const Dismiss = z
  .object({
    ids: z.array(uuidString).max(100).optional(),
    /** Automatic banners: repack:<rigId>:<due> or repacks:<digest>. */
    keys: z.array(z.string().regex(AUTO_KEY, 'not a banner key')).max(100).optional(),
  })
  .strict()
  .refine((d) => (d.ids?.length ?? 0) + (d.keys?.length ?? 0) > 0, {
    message: 'nothing to dismiss',
  });
