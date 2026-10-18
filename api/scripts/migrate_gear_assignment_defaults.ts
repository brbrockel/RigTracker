import mongoose from 'mongoose';
import { GearSchema } from '../src/gear/gear.schema';

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/rigtracker';
  console.log('Connecting to', mongoUri.replace(/\/\/[^@/]*@/, '//***@'));
  await mongoose.connect(mongoUri);

  const Gear = mongoose.model('Gear', GearSchema);

  // Ensure every existing gear document has explicit assignment fields.
  // This is safe to re-run and does not overwrite non-empty assignments.
  const rigBackfill = await Gear.updateMany(
    {
      $or: [{ assignedRigId: { $exists: false } }, { assignedRigId: null }, { assignedRigId: '' }],
    },
    { $set: { assignedRigId: null } },
  );

  const personBackfill = await Gear.updateMany(
    {
      $or: [
        { assignedPersonId: { $exists: false } },
        { assignedPersonId: null },
        { assignedPersonId: '' },
      ],
    },
    { $set: { assignedPersonId: null } },
  );

  console.log(`Backfilled assignedRigId on ${rigBackfill.modifiedCount} gear item(s).`);
  console.log(`Backfilled assignedPersonId on ${personBackfill.modifiedCount} gear item(s).`);
  console.log('Done.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
