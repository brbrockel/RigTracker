import { z } from 'zod';
import { RIG_SLOTS } from '../db/schema.js';
import { date, mediaUrl, queryId, queryString, ref, text } from '../common/validation.js';

export const GearBody = z
  .object({
    name: text(),
    type: text(60),
    // Serial numbers are unique; a blank one is stored as null (any number of gear can have none).
    serialNumber: text(60),
    dateOfManufacture: date(),
    notes: text(1000),
    imageUrl: mediaUrl(),
    assignedRigId: ref(),
    assignedPersonId: ref(),
    /** Which of its rig's components it is; needs a rig. '' or null: not a component. */
    slot: z.preprocess((v) => (v === '' ? null : v), z.enum(RIG_SLOTS).nullable().optional()),
  })
  .strict();
export type GearBody = z.infer<typeof GearBody>;

export const GearQuery = z.object({
  rigId: queryId(),
  personId: queryId(),
  unassigned: queryString(),
});
