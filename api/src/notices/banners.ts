import { createHash } from 'node:crypto';
import type { NoticeAudience } from '../db/schema.js';

export const DAY = 24 * 60 * 60 * 1000;
/** Repack reminders start this many days before the due date. */
export const REPACK_DAYS = 14;
/** Dates before this are blanks from the old spreadsheet import, not real due dates. */
const FIRST_REAL_DAY = '1950-01-01';

/**
 * Whether a stored notice shows as a banner right now, for one person. It does until
 * banner_until, or by default for a week (two days for a notice to one person); a pinned
 * ("must see") one without an end until the person dismisses it. Dismissing always clears it.
 */
export function bannerState(
  n: {
    audience: NoticeAudience;
    pinned: boolean;
    bannerUntil: Date | null;
    createdAt: Date;
    updatedAt: Date | null;
  },
  dismissed: boolean,
  now: Date,
) {
  const from = (n.updatedAt ?? n.createdAt).getTime();
  const until =
    n.bannerUntil ?? (n.pinned ? null : new Date(from + (n.audience === 'person' ? 2 : 7) * DAY));
  return {
    banner: !dismissed && (until === null || now < until),
    dismissible: true,
    urgent: n.pinned,
    bannerUntil: until?.toISOString() ?? null,
  };
}

/** A banner the app makes itself (not stored as a notice). */
export interface AutoBanner {
  /** Stable: dismissing it keeps it away until this changes. */
  key: string;
  kind: 'repack' | 'repacks';
  title: string;
  label: string;
  urgent: boolean;
  link: string;
  /** For ordering: the due date (a rig's), or the earliest due date (the summary). */
  createdAt: string;
}

export interface RepackRig {
  id: string;
  number: string | null;
  name: string | null;
  repackDue: string | null;
  primaryUserId: string | null;
}

/** Today as yyyy-mm-dd (UTC, as the app counts repack days). */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) =>
  utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY));

/** "Jun 8", with the year when it isn't this year's. */
export function shortDay(day: string, today: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  });
}

const rigName = (r: RepackRig) => (r.number ? `Rig #${r.number}` : r.name || 'Your rig');

/**
 * Repack reminders: a rig's primary person gets a banner when its repack is due within two
 * weeks or overdue; admins get one summary of all of them, linking to Rigs filtered to them.
 */
export function repackBanners(
  rigs: RepackRig[],
  me: { id: string; isAdmin: boolean },
  today = utcDay(),
): AutoBanner[] {
  const last = addDays(today, REPACK_DAYS);
  const due = rigs
    .filter((r): r is RepackRig & { repackDue: string } =>
      Boolean(r.repackDue && r.repackDue >= FIRST_REAL_DAY && r.repackDue <= last),
    )
    .sort((a, b) => a.repackDue.localeCompare(b.repackDue) || a.id.localeCompare(b.id));
  const out: AutoBanner[] = due
    .filter((r) => r.primaryUserId === me.id)
    .map((r) => {
      const overdue = r.repackDue < today;
      return {
        key: `repack:${r.id}:${r.repackDue}`,
        kind: 'repack',
        title: `${rigName(r)} repack ${overdue ? 'overdue since' : 'due'} ${shortDay(r.repackDue, today)}`,
        label: 'Your rig',
        urgent: overdue,
        link: `/rigs/${r.id}`,
        createdAt: `${r.repackDue}T00:00:00.000Z`,
      };
    });
  if (me.isAdmin && due.length) {
    const overdue = due.filter((r) => r.repackDue < today).length;
    const soon = due.length - overdue;
    const rigsWord = (n: number) => `${n} rig${n === 1 ? '' : 's'}`;
    const title = [
      overdue ? `${rigsWord(overdue)} overdue` : '',
      soon ? `${overdue ? soon : rigsWord(soon)} due within ${REPACK_DAYS} days` : '',
    ]
      .filter(Boolean)
      .join(', ');
    // Changes whenever a rig joins or leaves the list, or a due date moves.
    const digest = createHash('sha256')
      .update(due.map((r) => `${r.id}:${r.repackDue}:${r.repackDue < today ? 1 : 0}`).join(','))
      .digest('hex')
      .slice(0, 16);
    out.push({
      key: `repacks:${digest}`,
      kind: 'repacks',
      title,
      label: 'Repacks',
      urgent: overdue > 0,
      link: '/rigs?filter=repack',
      createdAt: `${due[0]!.repackDue}T00:00:00.000Z`,
    });
  }
  return out;
}

/** Keys of automatic banners, as dismiss accepts them. */
export const AUTO_KEY = /^(repack:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}|repacks:[0-9a-f]{16})$/;
