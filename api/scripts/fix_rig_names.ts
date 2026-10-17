import mongoose from 'mongoose'
import { RigSchema } from '../src/rigs/rig.schema'

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/rigtracker'
  console.log('Connecting to', mongoUri.replace(/\/\/[^@/]*@/, '//***@'))
  await mongoose.connect(mongoUri)

  const Rig = mongoose.model('Rig', RigSchema)

  // Find rigs missing a name but with a number
  const cursor = Rig.find({
    $and: [
      { $or: [{ name: { $exists: false } }, { name: null }, { name: '' }] },
      { number: { $exists: true, $ne: null } }
    ]
  }).cursor()

  let updated = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      const num = String((doc as any).number).trim()
      if (!num) continue
      const newName = `rig-${num}`
      await Rig.updateOne({ _id: doc._id }, { $set: { name: newName } })
      console.log(`Updated rig ${doc._id} -> name='${newName}'`)
      updated++
    } catch (err) {
      console.error('Error updating doc', doc._id, err)
    }
  }

  console.log(`Done. Updated ${updated} rig(s).`)
  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
