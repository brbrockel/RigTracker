import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Floating bar over the content (above the phone tab bar) for acting on the selection. */
export function BulkBar({
  count,
  onClear,
  status,
  children,
}: {
  count: number;
  onClear: () => void;
  /** Progress or an error from the last bulk change. */
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label="Selected items"
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-4 md:bottom-4 print:hidden"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 text-sm font-medium" aria-live="polite">
            {count} selected
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-1.5">{children}</div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X /> Clear
          </Button>
        </div>
        {status}
      </div>
    </div>
  );
}
