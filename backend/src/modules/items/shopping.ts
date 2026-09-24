export const UNDO_BOUGHT_MS = 2 * 60 * 1000;

export function undoDeadline(boughtAt: Date, now = Date.now()) {
  return boughtAt.getTime() + UNDO_BOUGHT_MS > now;
}

export function advanceDue(from: Date, intervalDays: number, now = new Date()) {
  const next = new Date(from);
  const step = intervalDays * 24 * 60 * 60 * 1000;
  if (step <= 0) return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  while (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + step);
  }
  return next;
}
