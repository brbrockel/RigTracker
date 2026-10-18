import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { RepackBadge } from '@/components/rigs/RepackBadge';
import { Thumb } from '@/components/Thumb';
import { Card } from '@/components/ui/card';
import { rigLabel, type Rig } from '@/lib/api';

/** The large rig card: photo, name, primary person and repack status. */
export function RigCard({
  rig: r,
  person,
  select,
  menu,
}: {
  rig: Rig;
  /** The primary person's name, if known. */
  person?: string;
  select?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        {select}
        <Link to={`/rigs/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Thumb url={r.coverUrl} alt={rigLabel(r)} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{rigLabel(r)}</div>
            <div className="truncate text-sm text-muted-foreground">
              {r.primaryUserId ? person || 'Unknown person' : 'No primary person'}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <RepackBadge rig={r} />
            </div>
          </div>
        </Link>
        {menu}
      </div>
    </Card>
  );
}
