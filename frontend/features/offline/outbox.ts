import { useMutationState, type Mutation } from "@tanstack/react-query";
import { isOnline, onOnlineChange } from "@/features/offline/network";
import {
  mutationHooks,
  OUTBOX_KEY,
  outboxRuntime,
  queryClient,
} from "@/features/offline/query-client";
import { failureKind } from "@/features/offline/rules";
import { formatAppError } from "@/lib/errors";

/**
 * The outbox: every change the app makes (add, edit, tick, delete…) goes
 * through here as a TanStack mutation.
 *
 * - With a connection it is sent at once and the caller gets the server's answer.
 * - Without one it waits (saved on the phone) and the caller is told "queued":
 *   the screen keeps the change, and it is sent when the connection returns.
 *
 * Changes are sent one at a time, in the order they were made.
 */
/** What the "Waiting to sync" sheet says about a change. */
export type ChangeAction =
  | "add"
  | "edit"
  | "delete"
  | "buy"
  | "undo"
  | "notFound"
  | "found"
  | "reorder"
  | "move"
  | "urgent"
  | "later"
  | "back"
  | "price"
  | "invoice"
  | "photo"
  | "settings";

export type ChangeLabel = {
  action: ChangeAction;
  /** The thing changed (an item or list name); left out for "3 items" style rows. */
  title?: string;
  /** How many things, when it is more than one. */
  count?: number;
};

export type OutboxEntry = {
  kind: string;
  payload: unknown;
  label: ChangeLabel;
  /** When the change was made (ms). */
  at: number;
};

export type ChangeKind<P, R> = Kind<P, R>;

type Kind<P, R> = {
  name: string;
  run: (payload: P) => Promise<R>;
  /** An error that still means "done" (e.g. deleting what is already gone). */
  tolerate?: (error: unknown) => boolean;
  /**
   * A queue of its own for slow work (photo uploads), so it never holds up
   * the quick changes. Left out: the main queue.
   */
  lane?: string;
  /** Runs when a change that waited offline was finally saved or refused. */
  afterWaiting?: (payload: P, outcome: "saved" | "refused") => void;
};

const kinds = new Map<string, Kind<never, unknown>>();

/** Registers a kind of change. Called once per kind, when its API file loads. */
export function defineChange<P, R = unknown>(
  name: string,
  run: (payload: P) => Promise<R>,
  options?: Pick<Kind<P, R>, "tolerate" | "afterWaiting" | "lane">,
): Kind<P, R> {
  const kind: Kind<P, R> = { name, run, ...options };
  kinds.set(name, kind as unknown as Kind<never, unknown>);
  return kind;
}

/** Thrown for a saved change whose code is not loaded; it stays in the queue. */
class UnknownKindError extends Error {
  code = "NETWORK";
}

// The queue itself (one at a time, the retry rules) is set up beside the query
// client, before saved changes are read back; this is how one of them is sent.
outboxRuntime.run = async (value) => {
  const entry = value as OutboxEntry;
  const kind = kinds.get(entry.kind) as Kind<unknown, unknown> | undefined;
  if (!kind) throw new UnknownKindError(`Unknown change: ${entry.kind}`);
  try {
    return await kind.run(entry.payload);
  } catch (error) {
    if (kind.tolerate?.(error)) return undefined;
    throw error;
  }
};

type AnyMutation = Mutation<unknown, unknown, unknown, unknown>;

/** Changes whose caller is still waiting for the answer. The rest waited offline. */
const attached = new WeakSet<AnyMutation>();

export type OutboxEvent =
  /** A change that waited offline was refused by the server and dropped. */
  | { type: "refused"; entry: OutboxEntry; error: unknown }
  /** The queue is empty again and the screens should load the server's state. */
  | { type: "settled" };

const listeners = new Set<(event: OutboxEvent) => void>();

export function onOutboxEvent(listener: (event: OutboxEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: OutboxEvent) {
  for (const listener of listeners) listener(event);
}

/** Goes up whenever a change starts or ends; a load that spans one is out of date. */
let epoch = 0;
/** Something on screen may differ from the server once the queue is empty. */
let reloadWhenIdle = false;

export function changeEpoch() {
  return epoch;
}

/** A load was thrown away because a change was in progress: load again after it. */
export function noteStaleRead() {
  reloadWhenIdle = true;
}

export function pendingCount() {
  return queryClient.isMutating({ mutationKey: OUTBOX_KEY });
}

export function hasPending() {
  return pendingCount() > 0;
}

mutationHooks.onSuccess = (mutation) => {
  if (attached.has(mutation)) return;
  const entry = mutation.state.variables as OutboxEntry | undefined;
  if (!entry) return;
  reloadWhenIdle = true;
  (kinds.get(entry.kind) as Kind<unknown, unknown> | undefined)?.afterWaiting?.(entry.payload, "saved");
};

mutationHooks.onError = (mutation, error) => {
  if (attached.has(mutation)) return;
  const entry = mutation.state.variables as OutboxEntry | undefined;
  if (!entry) return;
  reloadWhenIdle = true;
  (kinds.get(entry.kind) as Kind<unknown, unknown> | undefined)?.afterWaiting?.(entry.payload, "refused");
  emit({ type: "refused", entry, error });
};

mutationHooks.onSettled = () => {
  epoch += 1;
  // This one still counts as pending until the cache has updated.
  setTimeout(() => {
    if (hasPending() || !reloadWhenIdle) return;
    reloadWhenIdle = false;
    emit({ type: "settled" });
  }, 0);
};

// Back online with nothing waiting: the screens still show the saved copy.
onOnlineChange((online) => {
  if (!online) return;
  setTimeout(() => {
    if (hasPending()) return;
    reloadWhenIdle = false;
    emit({ type: "settled" });
  }, 0);
});

export type SendResult<R> =
  | { ok: true; queued: false; data: R }
  /** Saved on the phone; it will be sent when the connection returns. */
  | { ok: true; queued: true }
  | { ok: false; error: unknown };

/** Makes a change: sends it now, or keeps it waiting when there is no connection. */
export function send<P, R>(kind: Kind<P, R>, payload: P, label: ChangeLabel): Promise<SendResult<R>> {
  epoch += 1;
  const cache = queryClient.getMutationCache();
  const mutation = cache.build(queryClient, {
    mutationKey: OUTBOX_KEY,
    ...(kind.lane ? { scope: { id: `omt-outbox-${kind.lane}` } } : {}),
  }) as unknown as AnyMutation;
  attached.add(mutation);
  const entry: OutboxEntry = { kind: kind.name, payload, label, at: Date.now() };

  return new Promise<SendResult<R>>((resolve) => {
    let finished = false;
    const stops: (() => void)[] = [];
    const finish = (result: SendResult<R>) => {
      if (finished) return;
      finished = true;
      for (const stop of stops) stop();
      // From here on nobody waits for the answer: the outbox reports it.
      if (result.ok && result.queued) attached.delete(mutation);
      resolve(result);
    };
    const check = () => {
      const state = mutation.state;
      const waiting =
        (state.isPaused && !isOnline()) ||
        (state.failureCount > 0 && failureKind(state.failureReason) === "offline");
      if (waiting) finish({ ok: true, queued: true });
    };
    stops.push(
      cache.subscribe((event) => {
        if (event.mutation === (mutation as never)) check();
      }),
    );
    stops.push(onOnlineChange(check));
    mutation.execute(entry).then(
      (data) => finish({ ok: true, queued: false, data: data as R }),
      (error) => finish({ ok: false, error }),
    );
    check();
  });
}

export type ChangeResult<R> = {
  /** The server's answer; missing while the change waits offline. */
  data?: R;
  queued: boolean;
  error: string | null;
};

/**
 * `send` with the result the app's API functions hand to the screens: a
 * queued change reads as a success. `direct` skips the queue (the widget keeps
 * its own list of taps and wants the plain answer).
 */
export async function perform<P, R>(
  kind: Kind<P, R>,
  payload: P,
  label: ChangeLabel,
  options?: { direct?: boolean },
): Promise<ChangeResult<R>> {
  if (options?.direct) {
    try {
      return { data: await kind.run(payload), queued: false, error: null };
    } catch (error) {
      if (kind.tolerate?.(error)) return { queued: false, error: null };
      return { queued: false, error: formatAppError(error) };
    }
  }
  const result = await send(kind, payload, label);
  if (!result.ok) return { queued: false, error: formatAppError(result.error) };
  if (result.queued) return { queued: true, error: null };
  return { data: result.data, queued: false, error: null };
}

/** Sends what waited on the phone, if the connection is there. */
export function resumeOutbox() {
  if (!isOnline()) return;
  void queryClient.resumePausedMutations();
}

/** The changes still waiting, oldest first. */
export function pendingEntries(): OutboxEntry[] {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: OUTBOX_KEY, status: "pending" })
    .map((mutation) => mutation.state.variables as OutboxEntry | undefined)
    .filter((entry): entry is OutboxEntry => Boolean(entry));
}

/** The same list for a screen: re-renders as changes are made and sent. */
export function usePendingChanges(): OutboxEntry[] {
  return useMutationState(
    {
      filters: { mutationKey: OUTBOX_KEY, status: "pending" },
      select: (mutation) => mutation.state.variables as OutboxEntry | undefined,
    },
    queryClient,
  ).filter((entry): entry is OutboxEntry => Boolean(entry));
}
