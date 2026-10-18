import { z } from 'zod';
import { customFields, date, mediaUrl, ref, text } from '../common/validation.js';

/** Every field a rig can have; all optional so the same schema serves create and update. */
export const RigBody = z
  .object({
    name: text(),
    number: text(20),
    container: text(),
    containerSerialNumber: text(60),
    containerDOM: date(),
    mainSize: text(60),
    mainDOM: date(),
    mainSerialNumber: text(60),
    reserveSize: text(60),
    reserveDOM: date(),
    reserveSerialNumber: text(60),
    lastPacked: date(),
    riggerINT: text(60),
    repackDue: date(),
    aadType: text(60),
    aadDOM: date(),
    aadSerialNumber: text(60),
    customFields: customFields(),
    primaryUserId: ref(),
    notes: text(2000),
    imageUrl: mediaUrl(),
  })
  .strict();
export type RigBody = z.infer<typeof RigBody>;
