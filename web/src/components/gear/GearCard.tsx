import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { GearSummary } from '@/components/gear/GearSummary';
import { Card } from '@/components/ui/card';
import { rigLabel, type Gear, type Rig } from '@/lib/api';

const pill = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent';

/** The large gear card: summary, rig and person links, and notes. */
export function GearCard({
  gear: g,
  rig,
  personName,
  select,
  menu,
}: {
  gear: Gear;
  rig?: Rig;
  personName?: string;
  select?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {select}
        <GearSummary gear={g}>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {g.assignedRigId && (
              <Link to={`/rigs/${g.assignedRigId}`} className={pill}>
                Rig: {rig ? rigLabel(rig) : 'Unknown rig'}
              </Link>
            )}
            {g.assignedPersonId && (
              <Link to={`/people/${g.assignedPersonId}`} className={pill}>
                Person: {personName ?? 'Unknown person'}
              </Link>
            )}
            {!g.assignedRigId && !g.assignedPersonId && (
              <span className="text-xs text-muted-foreground">Unassigned</span>
            )}
          </div>
          {g.notes && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{g.notes}</p>}
        </GearSummary>
        {menu}
      </div>
    </Card>
  );
}
