import * as fs from 'node:fs';

/**
 * Reads a setting that may be a Docker secret: NAME_FILE (a path, e.g. /run/secrets/x) wins over NAME.
 */
export function readSecret(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const file = env[`${name}_FILE`]?.trim();
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return env[name]?.trim() || undefined;
}
