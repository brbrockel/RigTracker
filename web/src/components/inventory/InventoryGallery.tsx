import type { ReactNode } from 'react';
import { Thumb } from '@/components/Thumb';
import { cn } from '@/lib/utils';
import { GroupHeading } from './GroupHeading';
import { ItemTitle } from './InventoryList';
import { SelectBox } from './SelectBox';
import type { Group, ItemSummary, Selection } from './types';

/** Photo-first panels in a grid. */
export function InventoryGallery<T>({
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
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {g.rows.map((row) => {
              const id = getId(row);
              const item = summary(row);
              const checked = !!selection?.selected.has(id);
              return (
                <li
                  key={id}
                  className={cn(
                    'relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md',
                    checked && 'ring-2 ring-primary',
                  )}
                >
                  <div className="aspect-square w-full">
                    <Thumb url={item.imageUrl} alt={item.title} className="size-full rounded-none" />
                  </div>
                  {selection && (
                    <SelectBox
                      label={`Select ${item.title}`}
                      checked={checked}
                      onChange={() => selection.toggle(id)}
                      className="absolute left-1.5 top-1.5 rounded-md bg-card/90 shadow-sm"
                    />
                  )}
                  <div className="flex items-start gap-1 p-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <ItemTitle item={item} className="text-sm" />
                      {item.subtitle && (
                        <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                      )}
                      {item.badges && <div className="mt-1 flex flex-wrap gap-1">{item.badges}</div>}
                    </div>
                    {rowMenu && <div className="relative z-10 -mr-1.5 -mt-1.5 shrink-0">{rowMenu(row)}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
