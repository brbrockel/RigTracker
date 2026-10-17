import { z } from 'zod'
import { date, mediaUrl, queryString, ref, text } from '../common/validation'

export const GearBody = z
  .object({
    name: text(),
    type: text(60),
    // Serial numbers are unique (sparse), so a blank one is removed rather than stored.
    serialNumber: text(60),
    dateOfManufacture: date(),
    notes: text(1000),
    imageUrl: mediaUrl(),
    assignedRigId: ref(),
    assignedPersonId: ref(),
  })
  .strict()
export type GearBody = z.infer<typeof GearBody>

export const GearQuery = z.object({
  rigId: queryString(),
  personId: queryString(),
  unassigned: queryString(),
})
