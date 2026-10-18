import { z } from 'zod';
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
  })
  .strict();
export type GearBody = z.infer<typeof GearBody>;

export const GearQuery = z.object({
  rigId: queryId(),
  personId: queryId(),
  unassigned: queryString(),
});
