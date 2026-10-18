import { z } from 'zod';
import { customFields, date, mediaUrl, ref, text } from '../common/validation.js';

/**
 * Every field a rig can have; all optional so the same schema serves create and update. Its
 * container, main, reserve and AAD are gear in the rig's slots (see GearBody.slot): the old
 * component fields (container, mainSize, aadSerialNumber, …) are refused like any unknown key.
 */
export const RigBody = z
  .object({
    name: text(),
    number: text(20),
    lastPacked: date(),
    riggerINT: text(60),
    repackDue: date(),
    customFields: customFields(),
    primaryUserId: ref(),
    notes: text(2000),
    imageUrl: mediaUrl(),
  })
  .strict();
export type RigBody = z.infer<typeof RigBody>;
