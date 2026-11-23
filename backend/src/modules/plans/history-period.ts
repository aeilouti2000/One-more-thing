/**
 * How long a home keeps its History. The host chooses 3, 6 or 12 months (up
 * to what the plan allows); "N months" means the current month and the N
 * months before it, in the home's time zone. Older months keep only their
 * saved totals.
 *
 * Shortening never deletes at once: for HISTORY_NOTICE_DAYS after a change to
 * a shorter period, the old period stays in force, so the host can go back
 * and nothing is lost. What History shows and what the clean-up job deletes
 * both read `months` from here, so they always agree.
 */
export const HISTORY_PERIODS = [3, 6, 12] as const;
export const DEFAULT_HISTORY_MONTHS = 3;
/** Days a shorter period waits before it applies. Also the clean-up's grace after a plan change. */
export const HISTORY_NOTICE_DAYS = 30;

const DAY_MS = 86_400_000;

export type HistoryPeriod = {
  /** What the host chose. */
  chosen: number;
  /** In force now: what History shows and what the job keeps. */
  months: number;
  /** A shorter period waiting for its date; null when none. */
  pending: { months: number; from: Date } | null;
  /** What this home may choose (the offered periods up to the plan's limit). */
  options: number[];
};

export type HistoryColumns = {
  historyMonths: number;
  historyMonthsBefore: number | null;
  historyMonthsChangedAt: Date | null;
};

export function historyPeriodOf(home: HistoryColumns, planMonths: number, now = new Date()): HistoryPeriod {
  const offered = HISTORY_PERIODS.filter((months) => months <= planMonths);
  const options = offered.length > 0 ? [...offered] : [planMonths];
  const chosen = Math.min(home.historyMonths, planMonths);

  if (home.historyMonthsBefore !== null && home.historyMonthsChangedAt !== null) {
    const before = Math.min(home.historyMonthsBefore, planMonths);
    const from = new Date(home.historyMonthsChangedAt.getTime() + HISTORY_NOTICE_DAYS * DAY_MS);
    if (before > chosen && now.getTime() < from.getTime()) {
      return { chosen, months: before, pending: { months: chosen, from }, options };
    }
  }
  return { chosen, months: chosen, pending: null, options };
}

/**
 * The columns to write when the host chooses `next` (spec 4.3). Null when
 * nothing changes. Shortening keeps the period in force for the notice;
 * lengthening applies at once and cancels a waiting shortening.
 */
export function historyChange(
  home: HistoryColumns,
  planMonths: number,
  next: number,
  now = new Date(),
): HistoryColumns | null {
  const period = historyPeriodOf(home, planMonths, now);
  if (next === period.chosen) return null;
  if (next < period.months) {
    return { historyMonths: next, historyMonthsBefore: period.months, historyMonthsChangedAt: now };
  }
  return { historyMonths: next, historyMonthsBefore: null, historyMonthsChangedAt: null };
}
