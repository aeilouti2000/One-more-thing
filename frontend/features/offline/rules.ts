/**
 * What a failed send means for a change waiting on the phone. Kept free of
 * app imports so the rules can be tested on their own.
 */
export type FailureKind =
  /** No answer from the server (no internet, or it is still waking): keep waiting. */
  | "offline"
  /** The server is busy or limiting requests: try again shortly. */
  | "busy"
  /** The server said no (the item is gone, no access any more): drop the change. */
  | "refused";

function field(error: unknown, name: string) {
  return typeof error === "object" && error !== null && name in error
    ? (error as Record<string, unknown>)[name]
    : undefined;
}

export function failureKind(error: unknown): FailureKind {
  if (field(error, "code") === "NETWORK") return "offline";
  const status = Number(field(error, "status") ?? 0);
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return "busy";
  }
  // The server answered with a real refusal.
  if (status >= 400) return "refused";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("failed to fetch") ||
    message.includes("offline")
  ) {
    return "offline";
  }
  return "refused";
}

/** Tries allowed while the server keeps answering "busy" before the change is dropped. */
export const BUSY_TRIES = 6;
/** A change that fails this many times in total is dropped, so it can't block the others forever. */
export const MAX_TRIES = 40;

/** Whether a change that just failed should stay in the queue. */
export function keepsWaiting(failures: number, error: unknown) {
  if (failures >= MAX_TRIES) return false;
  const kind = failureKind(error);
  if (kind === "offline") return true;
  if (kind === "busy") return failures < BUSY_TRIES;
  return false;
}

/** How long to wait before the next try. */
export function retryWaitMs(failures: number, error: unknown) {
  // Without a connection the queue pauses by itself; this is only the short
  // moment before it notices.
  if (failureKind(error) === "offline") return 800;
  return Math.min(30_000, 2000 * 2 ** Math.max(0, failures - 1));
}

/** "Already gone" is what a delete wanted: the server's 404 counts as done. */
export function isAlreadyGone(error: unknown) {
  return Number(field(error, "status") ?? 0) === 404;
}

/** Steps between checks while the server cannot be reached. */
const PROBE_WAITS_MS = [2000, 4000, 8000, 15_000, 30_000];

export function probeWaitMs(attempt: number) {
  return PROBE_WAITS_MS[Math.min(Math.max(0, attempt), PROBE_WAITS_MS.length - 1)];
}
