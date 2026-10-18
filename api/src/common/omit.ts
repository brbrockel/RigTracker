/** A copy of `o` without `keys` (e.g. columns the API never returns). */
export function omit<T extends object, K extends keyof T>(o: T, ...keys: K[]): Omit<T, K> {
  const out = { ...o };
  for (const key of keys) delete out[key];
  return out;
}
