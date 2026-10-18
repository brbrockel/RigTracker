import * as fs from 'fs';
import mongoose from 'mongoose';

/** Starts every run with an empty test database and uploads folder. */
export default async function setup(): Promise<() => Promise<void>> {
  const uri = process.env.MONGO_URI!;
  if (!/test/.test(new URL(uri).pathname))
    throw new Error(`Refusing to drop a non-test database: ${uri}`);
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    await conn.dropDatabase();
  } finally {
    await conn.close();
  }
  const uploads = process.env.UPLOADS_DIR!;
  fs.rmSync(uploads, { recursive: true, force: true });
  fs.mkdirSync(uploads, { recursive: true });
  return async () => {
    fs.rmSync(uploads, { recursive: true, force: true });
  };
}
