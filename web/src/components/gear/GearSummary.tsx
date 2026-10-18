import type { ReactNode } from 'react';
import { Thumb } from '@/components/Thumb';
import { Badge } from '@/components/ui/badge';
import { formatDate, type Gear } from '@/lib/api';

/** Photo, name, type, serial and manufacture date for one gear item; extra goes underneath. */
export function GearSummary({ gear: g, children }: { gear: Gear; children?: ReactNode }) {
  const meta = [
    g.serialNumber && `S/N ${g.serialNumber}`,
    g.dateOfManufacture && `Made ${formatDate(g.dateOfManufacture)}`,
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <Thumb url={g.coverUrl} alt={g.name || 'Gear'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{g.name || 'Unnamed gear'}</span>
          {g.type && <Badge>{g.type}</Badge>}
        </div>
        {meta.length > 0 && (
          <div className="mt-0.5 text-sm text-muted-foreground">{meta.join(' · ')}</div>
        )}
        {children}
      </div>
    </div>
  );
}
