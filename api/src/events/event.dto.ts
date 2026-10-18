import { z } from 'zod';
import { date, text } from '../common/validation.js';

/** Photos and videos are media (POST /api/media); the 1.x eventPhotoUrl and photoUrls are refused. */
export const EventBody = z
  .object({
    name: text(),
    eventDate: date(),
    description: text(5000),
  })
  .strict();
export type EventBody = z.infer<typeof EventBody>;
