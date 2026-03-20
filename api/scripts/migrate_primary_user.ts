import mongoose from 'mongoose'
import { RigSchema } from '../src/rigs/rig.schema'
import { PersonSchema } from '../src/people/person.schema'

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/rigtracker'
  console.log('Connecting to', mongoUri)
  await mongoose.connect(mongoUri)

  const Rig = mongoose.model('Rig', RigSchema)
  const Person = mongoose.model('Person', PersonSchema)

  // Find rigs missing primaryUserId
  const cursor = Rig.find({ $or: [{ primaryUserId: { $exists: false } }, { primaryUserId: null }, { primaryUserId: '' }] }).cursor()

  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      const cf = (doc as any).customFields || {}
      const primaryNameRaw = cf['Primary User'] || cf.Primary || cf['primary user'] || cf['Primary']
      if (!primaryNameRaw) {
        console.log(`Skipping ${doc._id} — no Primary User in customFields`)
        continue
      }

      const name = String(primaryNameRaw).trim()
      if (!name) {
        console.log(`Skipping ${doc._id} — empty Primary User`)
        continue
      }

      // Try exact displayName match (case-insensitive)
      const displayRegex = new RegExp(`^${escapeRegex(name)}$`, 'i')
      let person = await Person.findOne({ $or: [{ displayName: displayRegex }, { 'customFields.displayName': displayRegex }] })

      // If not found, try match by first/last name tokens
      if (!person) {
        const parts = name.split(/\s+/).filter(Boolean)
        if (parts.length >= 2) {
          const first = parts[0]
          const last = parts[parts.length - 1]
          person = await Person.findOne({ $and: [{ firstName: new RegExp(`^${escapeRegex(first)}$`, 'i') }, { lastName: new RegExp(`^${escapeRegex(last)}$`, 'i') }] })
        }
      }

      if (!person) {
        console.log(`No person match for rig ${doc._id} name='${name}'`)
        continue
      }

      const personName = (person as any).displayName || [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')
      const toSet: any = { primaryUserId: person._id.toString() }
      // Only update if different
      if ((doc as any).primaryUserId !== toSet.primaryUserId) {
        await Rig.updateOne({ _id: doc._id }, { $set: toSet })
        console.log(`Updated rig ${doc._id} -> primaryUserId='${toSet.primaryUserId}' (${personName})`)
        updated++
      }
    } catch (err) {
      console.error('Error processing rig', doc._id, err)
    }
  }

  console.log(`Done. Updated ${updated} rig(s).`)
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
