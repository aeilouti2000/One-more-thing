export const UNDO_BOUGHT_MS = 2 * 60 * 1000;

export function undoDeadline(boughtAt: Date, now = Date.now()) {
  return boughtAt.getTime() + UNDO_BOUGHT_MS > now;
}

/** Far future so once-pins never match findDue. */
export function neverDue() {
  return new Date(Date.UTC(9999, 0, 1));
}

export function advanceDue(from: Date, intervalDays: number, now = new Date()) {
  // Once: keep on the pin list as a template, never auto-add again.
  if (intervalDays <= 0) return neverDue();
  const next = new Date(from);
  const step = intervalDays * 24 * 60 * 60 * 1000;
  while (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + step);
  }
  return next;
}
