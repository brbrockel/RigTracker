import { z } from 'zod';
import { date, mediaUrl, mediaUrlSchema, text } from '../common/validation';

export const EventBody = z
  .object({
    name: text(),
    eventDate: date(),
    description: text(5000),
    /** The main photo or video; it's always also in photoUrls. */
    eventPhotoUrl: mediaUrl(),
    photoUrls: z.array(mediaUrlSchema).max(500).optional(),
  })
  .strict();
export type EventBody = z.infer<typeof EventBody>;
