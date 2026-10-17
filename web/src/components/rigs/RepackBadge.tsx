import { Badge } from '@/components/ui/badge';
import { daysUntil, formatDate, type Rig } from '@/lib/api';

/** Rigs due for a reserve repack within this many days are flagged. */
export const DUE_SOON_DAYS = 30;

export type RepackState = 'overdue' | 'soon' | 'ok' | 'none';

export function repackState(rig: Pick<Rig, 'repackDue'>): RepackState {
  const days = daysUntil(rig.repackDue);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'soon';
  return 'ok';
}

/** Repack status: red when overdue, amber when due within 30 days, plain otherwise. */
export function RepackBadge({ rig }: { rig: Pick<Rig, 'repackDue'> }) {
  const state = repackState(rig);
  if (state === 'none') return null;
  const days = daysUntil(rig.repackDue) ?? 0;
  if (state === 'overdue')
    return (
      <Badge className="bg-destructive/15 text-destructive">
        Repack overdue · {formatDate(rig.repackDue)}
      </Badge>
    );
  if (state === 'soon')
    return (
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
        {days === 0 ? 'Repack due today' : `Repack due in ${days} day${days === 1 ? '' : 's'}`}
      </Badge>
    );
  return <Badge>Repack due {formatDate(rig.repackDue)}</Badge>;
}
