import type { Group, GroupOption, SortDir, SortValue } from './types';

/** Natural order: "2" before "10", case-insensitive. */
export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const empty = (v: SortValue) => v === null || v === undefined || v === '';

/** Sorts by value (empty values last in either direction), ties broken by label. */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  dir: SortDir,
  label: (row: T) => string,
): T[] {
  const tie = (x: T, y: T) => collator.compare(label(x), label(y));
  return [...rows].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (empty(a) || empty(b)) {
      if (empty(a) && empty(b)) return tie(x, y);
      return empty(a) ? 1 : -1;
    }
    let c =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : collator.compare(String(a), String(b));
    if (dir === 'desc') c = -c;
    return c || tie(x, y);
  });
}

/** Splits sorted rows into groups, keeping the order within each group. */
export function groupRows<T>(rows: readonly T[], group?: GroupOption<T>): Group<T>[] {
  if (!group) return [{ key: '', label: null, rows: [...rows] }];
  const map = new Map<string, Group<T> & { rank: number }>();
  for (const row of rows) {
    const g = group.of(row);
    let entry = map.get(g.key);
    if (!entry) {
      entry = { key: g.key, label: g.label, rank: g.rank ?? 0, rows: [] };
      map.set(g.key, entry);
    }
    entry.rows.push(row);
  }
  return [...map.values()]
    .sort((a, b) => a.rank - b.rank || collator.compare(a.label ?? '', b.label ?? ''))
    .map(({ key, label, rows }) => ({ key, label, rows }));
}

/** A stored date as a sortable number, or null when unset. */
export const timeOf = (d: Date | null) => (d ? d.getTime() : null);
