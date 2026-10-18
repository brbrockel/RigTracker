import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SelectBox } from './SelectBox';
import type { ColumnDef, Group, Selection, SortState } from './types';

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' };

/** Detailed rows: sortable headers, optional selection checkboxes and a trailing actions menu. */
export function InventoryTable<T>({
  columns,
  groups,
  getId,
  getLabel,
  sort,
  onSort,
  selection,
  rowMenu,
  caption,
  scroll = true,
}: {
  columns: ColumnDef<T>[];
  groups: Group<T>[];
  getId: (row: T) => string;
  getLabel: (row: T) => string;
  sort?: SortState;
  onSort?: (columnId: string) => void;
  selection?: Selection;
  rowMenu?: (row: T) => ReactNode;
  caption: string;
  /** false for the print copy: no inner scroll box. */
  scroll?: boolean;
}) {
  const ids = groups.flatMap((g) => g.rows.map(getId));
  const selectedCount = selection ? ids.filter((id) => selection.selected.has(id)).length : 0;
  const hasMenu = !!rowMenu;
  const span = columns.length + (selection ? 1 : 0) + (hasMenu ? 1 : 0);

  return (
    <div
      className={cn(
        'rounded-xl border bg-card',
        scroll && 'overflow-x-auto md:max-h-[calc(100dvh-14rem)] md:overflow-y-auto',
        'print:max-h-none print:overflow-visible print:rounded-none print:border-0',
      )}
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-20 bg-card print:static">
          <tr className="border-b">
            {selection && (
              <th scope="col" className="w-10 px-2 py-2 print:hidden">
                <SelectBox
                  label="Select all shown"
                  checked={ids.length > 0 && selectedCount === ids.length}
                  indeterminate={selectedCount > 0 && selectedCount < ids.length}
                  onChange={(on) => selection.setMany(ids, on)}
                />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.by === c.id;
              const ariaSort = active
                ? sort!.dir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined;
              const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    'whitespace-nowrap px-3 py-2 font-medium text-muted-foreground',
                    alignClass[c.align ?? 'left'],
                  )}
                >
                  {c.sortValue && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.id)}
                      className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {c.label}
                      <Icon
                        className={cn('size-3.5 print:hidden', !active && 'opacity-40')}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
            {hasMenu && (
              <th scope="col" className="w-12 px-2 py-2 print:hidden">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            {g.label !== null && (
              <tr className="border-b bg-muted/60">
                <th
                  scope="colgroup"
                  colSpan={span}
                  className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground"
                >
                  {g.label} <span className="font-normal">({g.rows.length})</span>
                </th>
              </tr>
            )}
            {g.rows.map((row) => {
              const id = getId(row);
              const checked = !!selection?.selected.has(id);
              return (
                <tr
                  key={id}
                  className={cn(
                    'border-b last:border-b-0 hover:bg-accent/40 print:break-inside-avoid',
                    checked && 'bg-accent/60',
                  )}
                >
                  {selection && (
                    <td className="px-2 py-1.5 print:hidden">
                      <SelectBox
                        label={`Select ${getLabel(row)}`}
                        checked={checked}
                        onChange={() => selection.toggle(id)}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cn(
                        'px-3 py-2 align-middle',
                        alignClass[c.align ?? 'left'],
                        c.className,
                      )}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                  {hasMenu && (
                    <td className="px-1 py-1 text-right print:hidden">{rowMenu!(row)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
