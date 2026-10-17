import mongoose from 'mongoose'
import { PersonSchema } from '../src/people/person.schema'

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/rigtracker'
  console.log('Connecting to', mongoUri.replace(/\/\/[^@/]*@/, '//***@'))
  await mongoose.connect(mongoUri)

  const Person = mongoose.model('Person', PersonSchema)

  const cursor = Person.find().cursor()
  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      const first = doc.firstName ? String(doc.firstName).trim() : ''
      const middle = doc.middleName ? String(doc.middleName).trim() : ''
      const last = doc.lastName ? String(doc.lastName).trim() : ''
      const display = [first, middle, last].filter(Boolean).join(' ').trim()
      const toSet: any = { firstName: first }
      if (doc.middleName !== middle) toSet.middleName = middle
      if (doc.lastName !== last) toSet.lastName = last
      if ((doc as any).displayName !== display) toSet.displayName = display

      // Only update if something changed
      if (Object.keys(toSet).length > 0) {
        await Person.updateOne({ _id: doc._id }, { $set: toSet })
        console.log(`Updated person ${doc._id} -> displayName='${display}'`)
        updated++
      }
    } catch (err) {
      console.error('Error updating person', doc._id, err)
    }
  }

  console.log(`Done. Updated ${updated} person(s).`)
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
