import { useCallback, useRef, useState } from 'react';
import { VIEWS, type SortState, type ViewMode } from './types';

export interface ViewPrefs {
  view: ViewMode;
  sort: SortState;
  group: string;
  columns: string[];
}

export interface ViewPrefDefaults {
  /** Omit to pick by screen size: Table on md+ (≥768px), List on phones. */
  view?: ViewMode;
  sort: SortState;
  group: string;
  columns: string[];
}

/** Allowed values; anything else read from storage is replaced by the default. */
export interface ViewPrefOptions {
  sorts?: string[];
  groups?: string[];
  columns?: string[];
}

export const storageKey = (pageKey: string) => `rigtracker.view.${pageKey}`;

function defaultView(): ViewMode {
  try {
    return window.matchMedia('(min-width: 768px)').matches ? 'table' : 'list';
  } catch {
    return 'list';
  }
}

function load(pageKey: string, defaults: ViewPrefDefaults, valid: ViewPrefOptions): ViewPrefs {
  const base: ViewPrefs = {
    view: defaults.view ?? defaultView(),
    sort: defaults.sort,
    group: defaults.group,
    columns: defaults.columns,
  };
  let stored: unknown;
  try {
    const raw = localStorage.getItem(storageKey(pageKey));
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    return base;
  }
  if (!stored || typeof stored !== 'object') return base;
  const s = stored as Record<string, unknown>;
  const out = { ...base };
  if (typeof s.view === 'string' && (VIEWS as readonly string[]).includes(s.view)) out.view = s.view as ViewMode;
  const sort = s.sort as Record<string, unknown> | undefined;
  if (
    sort &&
    typeof sort === 'object' &&
    typeof sort.by === 'string' &&
    (sort.dir === 'asc' || sort.dir === 'desc') &&
    (!valid.sorts || valid.sorts.includes(sort.by))
  )
    out.sort = { by: sort.by, dir: sort.dir };
  if (typeof s.group === 'string' && (!valid.groups || valid.groups.includes(s.group))) out.group = s.group;
  if (Array.isArray(s.columns)) {
    const cols = s.columns.filter(
      (c): c is string => typeof c === 'string' && (!valid.columns || valid.columns.includes(c)),
    );
    if (cols.length) out.columns = [...new Set(cols)];
  }
  return out;
}

function save(pageKey: string, prefs: ViewPrefs) {
  try {
    localStorage.setItem(storageKey(pageKey), JSON.stringify(prefs));
  } catch {
    // No storage (private mode, blocked): the choice just isn't remembered.
  }
}

/** A page's layout, sort, grouping and table columns, remembered per device in localStorage. */
export function useViewPrefs(pageKey: string, defaults: ViewPrefDefaults, valid: ViewPrefOptions = {}) {
  const [prefs, setPrefs] = useState(() => load(pageKey, defaults, valid));
  const current = useRef(prefs);
  const update = useCallback(
    (patch: Partial<ViewPrefs>) => {
      const next = { ...current.current, ...patch };
      current.current = next;
      setPrefs(next);
      save(pageKey, next);
    },
    [pageKey],
  );
  return {
    ...prefs,
    setView: useCallback((view: ViewMode) => update({ view }), [update]),
    setSort: useCallback((sort: SortState) => update({ sort }), [update]),
    setGroup: useCallback((group: string) => update({ group }), [update]),
    setColumns: useCallback((columns: string[]) => update({ columns }), [update]),
  };
}
