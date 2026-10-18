import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ColumnDef } from './types';

/** Show or hide table columns; the menu stays open while toggling. */
export function ColumnsMenu<T>({
  columns,
  visible,
  onChange,
}: {
  columns: ColumnDef<T>[];
  visible: string[];
  onChange: (ids: string[]) => void;
}) {
  const shown = new Set(visible);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Columns">
          <Columns3 /> <span className="hidden sm:inline">Columns</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {columns.map((c) => {
          const locked = c.hideable === false;
          return (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={locked || shown.has(c.id)}
              disabled={locked}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) =>
                onChange(
                  columns.map((x) => x.id).filter((id) => (id === c.id ? on : shown.has(id))),
                )
              }
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
