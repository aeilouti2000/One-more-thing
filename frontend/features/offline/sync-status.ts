import { useSyncExternalStore } from "react";
import { isOnline, onOnlineChange } from "@/features/offline/network";
import { onOutboxEvent, pendingCount } from "@/features/offline/outbox";
import { queryClient } from "@/features/offline/query-client";

/**
 * What the cloud icon in the header shows:
 *
 * - "hidden": online and nothing waiting (the normal case: no icon at all);
 * - "offline": no connection; `count` changes are waiting on the phone;
 * - "syncing": the connection is back and the waiting changes are being sent;
 * - "done": they were all sent (shown for a moment, then hidden).
 */
export type SyncStatus = {
  state: "hidden" | "offline" | "syncing" | "done";
  count: number;
};

/** A change that is sent at once is not worth an icon; one that takes this long is. */
const SLOW_SEND_MS = 1500;
const DONE_SHOWN_MS = 1800;

let status: SyncStatus = { state: "hidden", count: 0 };
/** Changes are waiting or were waiting: the icon stays until they are all sent. */
let backlog = false;
let doneUntil = 0;
let slowTimer: ReturnType<typeof setTimeout> | null = null;
let doneTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function compute() {
  const online = isOnline();
  const count = pendingCount();

  if (count === 0) {
    if (slowTimer) clearTimeout(slowTimer);
    slowTimer = null;
    if (backlog) {
      backlog = false;
      if (online) {
        doneUntil = Date.now() + DONE_SHOWN_MS;
        if (doneTimer) clearTimeout(doneTimer);
        doneTimer = setTimeout(compute, DONE_SHOWN_MS + 20);
      }
    }
  } else if (!online) {
    backlog = true;
  } else if (!backlog && !slowTimer) {
    slowTimer = setTimeout(() => {
      slowTimer = null;
      if (pendingCount() > 0) backlog = true;
      compute();
    }, SLOW_SEND_MS);
  }

  const state: SyncStatus["state"] = !online
    ? "offline"
    : backlog && count > 0
      ? "syncing"
      : Date.now() < doneUntil
        ? "done"
        : "hidden";
  if (state === status.state && count === status.count) return;
  status = { state, count };
  for (const listener of listeners) listener();
}

onOnlineChange(compute);
queryClient.getMutationCache().subscribe(() => {
  // After the cache has counted this change in or out.
  setTimeout(compute, 0);
});
compute();

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    () => status,
    () => status,
  );
}

/* The few things the offline UI shares between screens. */

export type OfflineNotice = { id: number; kind: "refused" | "needsInternet"; count: number };

let sheetOpen = false;
let notice: OfflineNotice | null = null;
let noticeId = 0;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
const uiListeners = new Set<() => void>();
let ui: { sheetOpen: boolean; notice: OfflineNotice | null } = { sheetOpen, notice };

const NOTICE_SHOWN_MS = 3500;

function publish() {
  ui = { sheetOpen, notice };
  for (const listener of uiListeners) listener();
}

export function openSyncSheet() {
  sheetOpen = true;
  publish();
}

export function closeSyncSheet() {
  sheetOpen = false;
  publish();
}

function show(kind: OfflineNotice["kind"]) {
  // Several refusals in a row read as one message with a count.
  const count = notice?.kind === kind && kind === "refused" ? notice.count + 1 : 1;
  noticeId += 1;
  notice = { id: noticeId, kind, count };
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice = null;
    publish();
  }, NOTICE_SHOWN_MS);
  publish();
}

/** Tells the person that what they tapped needs a connection. */
export function showNeedsInternet() {
  show("needsInternet");
}

// A change that waited offline was refused by the server and dropped.
onOutboxEvent((event) => {
  if (event.type === "refused") show("refused");
});

export function useOfflineUi() {
  return useSyncExternalStore(
    (notify) => {
      uiListeners.add(notify);
      return () => {
        uiListeners.delete(notify);
      };
    },
    () => ui,
    () => ui,
  );
}
