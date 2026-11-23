import type { QueryKey } from "@tanstack/react-query";
import { isOnline, probeNow } from "@/features/offline/network";
import { changeEpoch, hasPending, noteStaleRead } from "@/features/offline/outbox";
import { readCache, writeCache } from "@/features/offline/query-client";
import { isOfflineError } from "@/lib/errors";

export type ReadResult<T> = {
  /** Fresh from the server, or the copy saved on this phone. */
  data: T | undefined;
  error: unknown;
  /** The saved copy answered because the server could not be reached. */
  offline: boolean;
};

/**
 * Loads something from the server and keeps the copy saved on the phone in
 * step. The saved copy answers instead when:
 *
 * - there is no connection, or
 * - a change made on this phone is still waiting or on its way: the server's
 *   list would not have it yet and would wipe it off the screen.
 */
export async function readThrough<T>(
  key: QueryKey,
  load: () => Promise<T>,
  /** Lets the fresh data keep phone-only details of the current copy. */
  merge?: (fresh: T, current: T | undefined) => T,
): Promise<ReadResult<T>> {
  const cached = () => readCache<T>(key);

  if (hasPending()) {
    const current = cached();
    if (current !== undefined) {
      noteStaleRead();
      return { data: current, error: null, offline: !isOnline() };
    }
  }
  if (!isOnline()) {
    const current = cached();
    if (current !== undefined) {
      // Known to be offline: answer at once, and check whether that changed.
      void probeNow();
      return { data: current, error: null, offline: true };
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = changeEpoch();
    try {
      const fresh = await load();
      if (hasPending()) {
        const current = cached();
        if (current !== undefined) {
          noteStaleRead();
          return { data: current, error: null, offline: false };
        }
      }
      // A change was made and saved while this was loading: the answer may be
      // from before it. Ask once more.
      if (changeEpoch() !== started && attempt === 0) continue;
      writeCache<T>(key, (current) => (merge ? merge(fresh, current) : fresh));
      return { data: cached(), error: null, offline: false };
    } catch (error) {
      const offline = isOfflineError(error);
      if (offline) {
        const current = cached();
        if (current !== undefined) return { data: current, error: null, offline: true };
      }
      return { data: undefined, error, offline };
    }
  }
  return { data: cached(), error: null, offline: false };
}
