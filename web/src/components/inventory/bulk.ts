import { useCallback, useState } from 'react';
import { errorMessage } from '@/lib/api';

export interface BulkResult<T> {
  ok: boolean;
  done: T[];
  /** Set when it stopped on a failure: what failed and what had already succeeded. */
  message?: string;
}

/**
 * Runs one request per item, one after another, stopping at the first failure.
 * progress is e.g. "Updating 3 of 12…" while it runs.
 */
export function useBulkRunner() {
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(
      items: T[],
      opts: {
        verb: string; // "Updating"
        past: string; // "Updated"
        label: (item: T) => string;
        each: (item: T) => Promise<unknown>;
      },
    ): Promise<BulkResult<T>> => {
      const done: T[] = [];
      setBusy(true);
      try {
        for (const [i, item] of items.entries()) {
          setProgress(`${opts.verb} ${i + 1} of ${items.length}…`);
          try {
            await opts.each(item);
          } catch (err) {
            const ok = done.length
              ? `${opts.past} ${done.length} of ${items.length} before stopping: ${done.map(opts.label).join(', ')}.`
              : 'Nothing was changed.';
            return { ok: false, done, message: `Stopped at ${opts.label(item)}: ${errorMessage(err)} ${ok}` };
          }
          done.push(item);
        }
        return { ok: true, done };
      } finally {
        setBusy(false);
        setProgress('');
      }
    },
    [],
  );

  return { run, progress, busy };
}
