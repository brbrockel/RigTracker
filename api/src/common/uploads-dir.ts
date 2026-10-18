import * as path from 'node:path';

/** Where uploaded media is stored: UPLOADS_DIR, or ./uploads under the working directory. */
export function uploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads'));
}
