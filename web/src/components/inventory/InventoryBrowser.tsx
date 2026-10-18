import { ArrowDownWideNarrow, ArrowUpWideNarrow, Download, FileDown, ListChecks, Printer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BulkBar } from './BulkBar';
import { ColumnsMenu } from './ColumnsMenu';
import { buildCsv, csvFilename, downloadCsv } from './csv';
import { GroupHeading } from './GroupHeading';
import { InventoryGallery } from './InventoryGallery';
import { InventoryList } from './InventoryList';
import { InventoryTable } from './InventoryTable';
import { SelectBox } from './SelectBox';
import { groupRows, sortRows } from './sort';
import type { ColumnDef, GroupOption, ItemSummary, Selection, SortOption, SortState, SortValue } from './types';
import { useViewPrefs } from './useViewPrefs';
import { ViewSwitcher } from './ViewSwitcher';

export interface InventoryBrowserProps<T> {
  /** Storage key part and CSV file name part, e.g. "gear". */
  pageKey: string;
  /** Page title for the printout. */
  title: string;
  /** The filtered records (sorting and grouping happen here). */
  rows: T[];
  columns: ColumnDef<T>[];
  sortOptions: SortOption<T>[];
  groupOptions: GroupOption<T>[];
  defaultSort: SortState;
  getId: (row: T) => string;
  /** The record's name, used for checkbox labels and as the sort tie-break. */
  getLabel: (row: T) => string;
  /** What the List and Gallery layouts show. */
  summary: (row: T) => ItemSummary;
  /** The existing card for one record; select is the checkbox while selecting. */
  renderCard: (row: T, parts: { select: ReactNode; menu: ReactNode }) => ReactNode;
  /** The ⋯ menu; leave out when the user has no row actions. */
  rowMenu?: (row: T) => ReactNode;
  /** Search box and filter selects, shown on the same row as the layout switcher. */
  filters: ReactNode;
  /** Loading or error message. */
  notice?: ReactNode;
  /** Shown instead of the list when there are no rows. */
  empty?: ReactNode;
  /** Extra bulk-bar buttons for the selected records (Export CSV is always there). */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  /** Progress or error from a bulk change, shown in the bulk bar. */
  bulkStatus?: ReactNode;
}

/** Search/filters, layout switcher, sort, grouping, selection, CSV export and print for a list page. */
export function InventoryBrowser<T>(props: InventoryBrowserProps<T>) {
  const { pageKey, title, rows, columns, sortOptions, groupOptions, defaultSort, getId, getLabel } = props;

  const prefs = useViewPrefs(
    pageKey,
    {
      sort: defaultSort,
      group: '',
      columns: columns.filter((c) => c.defaultVisible !== false).map((c) => c.id),
    },
    {
      sorts: [...sortOptions.map((s) => s.id), ...columns.filter((c) => c.sortValue).map((c) => c.id)],
      groups: ['', ...groupOptions.map((g) => g.id)],
      columns: columns.map((c) => c.id),
    },
  );
  const { view, sort, group } = prefs;

  const visibleColumns = useMemo(() => {
    const shown = new Set(prefs.columns);
    return columns.filter((c) => c.hideable === false || shown.has(c.id));
  }, [columns, prefs.columns]);

  const sortValue = useMemo((): ((row: T) => SortValue) => {
    const option = sortOptions.find((s) => s.id === sort.by);
    if (option) return option.value;
    const column = columns.find((c) => c.id === sort.by && c.sortValue);
    if (column?.sortValue) return column.sortValue;
    return sortOptions.find((s) => s.id === defaultSort.by)?.value ?? getLabel;
  }, [sortOptions, columns, sort.by, defaultSort.by, getLabel]);

  const groupOption = groupOptions.find((g) => g.id === group);
  const groups = useMemo(
    () => groupRows(sortRows(rows, sortValue, sort.dir, getLabel), groupOption),
    [rows, sortValue, sort.dir, getLabel, groupOption],
  );
  const ordered = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  // ── Selection ──
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const clear = useCallback(() => setSelected(new Set()), []);
  const selection: Selection | undefined = selecting
    ? {
        selected,
        toggle: (id) =>
          setSelected((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          }),
        setMany: (ids, on) =>
          setSelected((s) => {
            const next = new Set(s);
            for (const id of ids) {
              if (on) next.add(id);
              else next.delete(id);
            }
            return next;
          }),
      }
    : undefined;
  const selectedRows = selecting ? ordered.filter((r) => selected.has(getId(r))) : [];

  // ── Export and print ──
  const exportCsv = (list: T[]) => {
    const text = buildCsv(
      visibleColumns.map((c) => c.label),
      list.map((r) => visibleColumns.map((c) => c.text(r))),
    );
    downloadCsv(csvFilename(pageKey), text);
  };
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const onHeaderSort = (id: string) => {
    if (sort.by === id) prefs.setSort({ by: id, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else prefs.setSort({ by: id, dir: sortOptions.find((s) => s.id === id)?.defaultDir ?? 'asc' });
  };
  const sortIsOption = sortOptions.some((s) => s.id === sort.by);
  const sortColumn = columns.find((c) => c.id === sort.by);

  const menu = props.rowMenu;
  const tableFor = (scroll: boolean, sel?: Selection) => (
    <InventoryTable
      columns={visibleColumns}
      groups={groups}
      getId={getId}
      getLabel={getLabel}
      sort={sort}
      onSort={onHeaderSort}
      selection={sel}
      rowMenu={scroll ? menu : undefined}
      caption={title}
      scroll={scroll}
    />
  );

  let content: ReactNode;
  if (rows.length === 0) content = props.empty;
  else if (view === 'table') content = tableFor(true, selection);
  else if (view === 'list')
    content = (
      <InventoryList groups={groups} getId={getId} summary={props.summary} selection={selection} rowMenu={menu} />
    );
  else if (view === 'gallery')
    content = (
      <InventoryGallery groups={groups} getId={getId} summary={props.summary} selection={selection} rowMenu={menu} />
    );
  else
    content = (
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-3">
            {g.label !== null && <GroupHeading label={g.label} count={g.rows.length} />}
            {g.rows.map((row) => {
              const id = getId(row);
              return (
                <div key={id}>
                  {props.renderCard(row, {
                    select: selection ? (
                      <SelectBoxFor id={id} label={getLabel(row)} selection={selection} />
                    ) : null,
                    menu: menu ? menu(row) : null,
                  })}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    );

  const barVisible = selecting && selectedRows.length > 0;

  return (
    <>
      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {props.filters}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Phones: sort, direction and grouping share one row. */}
          <div className="flex w-full items-center gap-1 sm:w-auto sm:gap-2">
            <Select
              aria-label="Sort by"
              className="min-w-0 flex-1 sm:w-auto sm:flex-none"
              value={sort.by}
              onChange={(e) =>
                prefs.setSort({
                  by: e.target.value,
                  dir: sortOptions.find((s) => s.id === e.target.value)?.defaultDir ?? 'asc',
                })
              }
            >
              {sortOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  Sort: {s.label}
                </option>
              ))}
              {!sortIsOption && sortColumn && <option value={sortColumn.id}>Sort: {sortColumn.label}</option>}
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="size-11"
              aria-label={sort.dir === 'asc' ? 'Sort descending' : 'Sort ascending'}
              title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
              onClick={() => prefs.setSort({ by: sort.by, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
            >
              {sort.dir === 'asc' ? <ArrowUpWideNarrow /> : <ArrowDownWideNarrow />}
            </Button>
            <Select
              aria-label="Group by"
              className="min-w-0 flex-1 sm:w-auto sm:flex-none"
              value={group}
              onChange={(e) => prefs.setGroup(e.target.value)}
            >
              <option value="">No grouping</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  Group: {g.label}
                </option>
              ))}
            </Select>
          </div>
          {/* The layout switcher and the actions; on phones the actions are icons. */}
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <ViewSwitcher value={view} onChange={prefs.setView} />
            <div className="ml-auto flex items-center gap-2">
            <Button
              variant={selecting ? 'secondary' : 'outline'}
              aria-label="Select"
              aria-pressed={selecting}
              onClick={() => {
                if (selecting) clear();
                setSelecting(!selecting);
              }}
            >
              <ListChecks /> <span className="hidden sm:inline">Select</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="Export">
                  <Download /> <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={ordered.length === 0}
                  onSelect={() => exportCsv(selectedRows.length ? selectedRows : ordered)}
                >
                  <FileDown /> Download CSV{selectedRows.length ? ` (${selectedRows.length} selected)` : ''}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => window.print()}>
                  <Printer /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {view === 'table' && (
              <ColumnsMenu columns={columns} visible={prefs.columns} onChange={prefs.setColumns} />
            )}
            </div>
          </div>
        </div>
      </div>

      {printing && (
        <div className="hidden print:block">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm">
            {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} ·{' '}
            {ordered.length} {ordered.length === 1 ? 'item' : 'items'}
          </p>
        </div>
      )}
      {props.notice}
      <div className={cn(view !== 'table' && 'print:hidden', barVisible && 'pb-32 md:pb-20')}>{content}</div>
      {printing && view !== 'table' && rows.length > 0 && (
        <div className="hidden print:block">{tableFor(false)}</div>
      )}

      {barVisible && (
        <BulkBar count={selectedRows.length} onClear={clear} status={props.bulkStatus}>
          {props.bulkActions?.(selectedRows, clear)}
          <Button variant="outline" size="sm" onClick={() => exportCsv(selectedRows)}>
            <FileDown /> Export CSV
          </Button>
        </BulkBar>
      )}
    </>
  );
}

function SelectBoxFor({ id, label, selection }: { id: string; label: string; selection: Selection }) {
  return (
    <SelectBox label={`Select ${label}`} checked={selection.selected.has(id)} onChange={() => selection.toggle(id)} />
  );
}
