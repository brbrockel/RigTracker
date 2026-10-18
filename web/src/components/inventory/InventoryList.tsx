import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Thumb } from '@/components/Thumb';
import { cn } from '@/lib/utils';
import { GroupHeading } from './GroupHeading';
import { SelectBox } from './SelectBox';
import type { Group, ItemSummary, Selection } from './types';

/** The record's name: a link stretched over the whole row/panel when it has a page. */
export function ItemTitle({ item, className }: { item: ItemSummary; className?: string }) {
  if (!item.href) return <span className={cn('truncate font-medium', className)}>{item.title}</span>;
  return (
    <Link
      to={item.href}
      className={cn(
        'truncate font-medium after:absolute after:inset-0 after:rounded-[inherit] after:content-[""] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring',
        className,
      )}
    >
      {item.title}
    </Link>
  );
}

/** Compact one-line rows with a small photo. */
export function InventoryList<T>({
  groups,
  getId,
  summary,
  selection,
  rowMenu,
}: {
  groups: Group<T>[];
  getId: (row: T) => string;
  summary: (row: T) => ItemSummary;
  selection?: Selection;
  rowMenu?: (row: T) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          {g.label !== null && <GroupHeading label={g.label} count={g.rows.length} />}
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {g.rows.map((row) => {
              const id = getId(row);
              const item = summary(row);
              const checked = !!selection?.selected.has(id);
              return (
                <li
                  key={id}
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-2 hover:bg-accent/40',
                    checked && 'bg-accent/60',
                  )}
                >
                  {selection && (
                    <SelectBox
                      label={`Select ${item.title}`}
                      checked={checked}
                      onChange={() => selection.toggle(id)}
                      className="-ml-1"
                    />
                  )}
                  <Thumb url={item.imageUrl} alt={item.title} className="size-10 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-1 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <ItemTitle item={item} />
                      {item.subtitle && (
                        <span className="truncate text-sm text-muted-foreground">{item.subtitle}</span>
                      )}
                    </div>
                    {item.badges && <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">{item.badges}</div>}
                  </div>
                  {rowMenu && <div className="relative z-10 shrink-0">{rowMenu(row)}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
