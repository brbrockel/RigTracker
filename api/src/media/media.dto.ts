import { z } from 'zod';
import { MEDIA_OWNER_TYPES } from '../db/schema.js';
import { text, uuidString } from '../common/validation.js';

const ownerType = z.enum(MEDIA_OWNER_TYPES);

/** The form fields sent with POST /api/media's file. */
export const MediaCreateBody = z
  .object({
    ownerType,
    ownerId: uuidString,
    caption: text(200),
  })
  .strict();
export type MediaCreateBody = z.infer<typeof MediaCreateBody>;

export const MediaQuery = z.object({ ownerType, ownerId: uuidString }).strict();
export type MediaQuery = z.infer<typeof MediaQuery>;

/** PATCH /api/media/:id. makeCover moves it to the front (position 0). */
export const MediaPatchBody = z
  .object({
    caption: text(200),
    makeCover: z.literal(true).optional(),
    position: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
export type MediaPatchBody = z.infer<typeof MediaPatchBody>;
