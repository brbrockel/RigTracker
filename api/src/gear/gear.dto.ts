import { z } from 'zod';
import { RIG_SLOTS } from '../db/schema.js';
import { date, queryId, queryString, ref, text } from '../common/validation.js';

/** Photos are media (POST /api/media); the 1.x imageUrl is refused like any unknown key. */
export const GearBody = z
  .object({
    name: text(),
    type: text(60),
    // Serial numbers are unique; a blank one is stored as null (any number of gear can have none).
    serialNumber: text(60),
    dateOfManufacture: date(),
    notes: text(1000),
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
