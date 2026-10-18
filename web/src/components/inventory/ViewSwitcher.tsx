import { LayoutGrid, List, SquareStack, Table2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewMode } from './types';

const options: { view: ViewMode; label: string; icon: LucideIcon }[] = [
  { view: 'table', label: 'Table', icon: Table2 },
  { view: 'list', label: 'List', icon: List },
  { view: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { view: 'cards', label: 'Cards', icon: SquareStack },
];

/** Segmented toggle between the four layouts. */
export function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div role="group" aria-label="Layout" className="inline-flex h-11 shrink-0 rounded-lg border bg-card p-0.5 print:hidden">
      {options.map(({ view, label, icon: Icon }) => (
        <button
          key={view}
          type="button"
          aria-label={`${label} view`}
          aria-pressed={value === view}
          title={label}
          onClick={() => onChange(view)}
          className={cn(
            'inline-flex w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === view && 'bg-accent text-accent-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
