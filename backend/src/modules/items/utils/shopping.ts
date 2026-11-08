export const UNDO_BOUGHT_MS = 2 * 60 * 1000;

export function undoDeadline(boughtAt: Date, now = Date.now()) {
  return boughtAt.getTime() + UNDO_BOUGHT_MS > now;
}

/** Far future so once-pins never match findDue. */
export function neverDue() {
  return new Date(Date.UTC(9999, 0, 1));
}

/** Local hour a month-day pin arrives (early, but clear of DST edges). */
const MONTH_DAY_HOUR = 3;
const MINUTE_MS = 60 * 1000;

/**
 * Next time a monthly pin set to `monthDay` comes due: that day of the month
 * (or the month's last day when shorter), on a later local date than `now`.
 * `utcOffsetMin` is the owner's offset east of UTC.
 */
export function nextMonthDay(monthDay: number, utcOffsetMin: number, now = new Date()) {
  const day = Math.min(31, Math.max(1, Math.round(monthDay)));
  // Shift into the owner's local wall clock, work in UTC fields, shift back.
  const local = new Date(now.getTime() + utcOffsetMin * MINUTE_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  for (let add = 0; add < 3; add += 1) {
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth() + add;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const date = Date.UTC(year, month, Math.min(day, lastDay));
    if (date > today) {
      return new Date(date + MONTH_DAY_HOUR * 60 * MINUTE_MS - utcOffsetMin * MINUTE_MS);
    }
  }
  // Unreachable: next month always has a matching day.
  return advanceDue(now, 30, now);
}

/** Next due time for a pin's schedule. */
export function nextPinDue(
  pin: { intervalDays: number; monthDay?: number | null; utcOffsetMin?: number | null },
  from: Date,
  now = new Date(),
) {
  if (pin.intervalDays === 30 && pin.monthDay) {
    return nextMonthDay(pin.monthDay, pin.utcOffsetMin ?? 0, now);
  }
  return advanceDue(from, pin.intervalDays, now);
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
