import type { ReactNode } from 'react';

export const VIEWS = ['table', 'list', 'gallery', 'cards'] as const;
export type ViewMode = (typeof VIEWS)[number];

export type SortDir = 'asc' | 'desc';
export interface SortState {
  by: string;
  dir: SortDir;
}

/** A value to sort on; empty (null, undefined or '') always sorts last. */
export type SortValue = string | number | null | undefined;

export interface ColumnDef<T> {
  id: string;
  label: string;
  /** What the cell shows. */
  render: (row: T) => ReactNode;
  /** Plain text for CSV export (dates as yyyy-mm-dd). */
  text: (row: T) => string;
  /** Present when clicking the header sorts by this column. */
  sortValue?: (row: T) => SortValue;
  /** Shown until the user changes the columns (default true). */
  defaultVisible?: boolean;
  /** false keeps the column always visible (e.g. the name). */
  hideable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Extra classes for the cells. */
  className?: string;
}

export interface SortOption<T> {
  id: string;
  label: string;
  value: (row: T) => SortValue;
  /** The direction picked when this option is chosen (default asc). */
  defaultDir?: SortDir;
}

export interface GroupKey {
  key: string;
  label: string;
  /** Lower ranks come first; equal ranks are ordered by label. */
  rank?: number;
}

export interface GroupOption<T> {
  id: string;
  label: string;
  of: (row: T) => GroupKey;
}

export interface Group<T> {
  key: string;
  label: string | null;
  rows: T[];
}

/** What the List and Gallery layouts show for one record. */
export interface ItemSummary {
  title: string;
  href?: string;
  subtitle?: string;
  badges?: ReactNode;
  /** Its cover photo or video. */
  coverUrl?: string;
}

/** Per-row selection, present while selecting. */
export interface Selection {
  selected: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
}
