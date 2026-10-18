import * as fs from 'fs';

/**
 * Reads a setting that may be a Docker secret: NAME_FILE (a path, e.g. /run/secrets/x) wins over NAME.
 */
export function readSecret(name: string): string | undefined {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return process.env[name]?.trim() || undefined;
}
