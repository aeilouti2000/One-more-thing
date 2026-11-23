import type { HomeHistory } from "@/features/homes/types/household";

/**
 * The pure parts of the History period (docs/history-period-spec.md): the
 * server decides it (backend modules/plans/history-period.ts); the phone
 * mirrors the rule so the screen is right before the answer arrives.
 */

/** Days a shorter period waits before it applies (the server's HISTORY_NOTICE_DAYS). */
export const HISTORY_NOTICE_DAYS = 30;
const DAY_MS = 86_400_000;

/** The home's `history` as sent, or null from an older server (the setting is then hidden). */
export function readHistory(value: unknown): HomeHistory | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const options = Array.isArray(raw.options) ? raw.options.filter((n): n is number => typeof n === "number") : [];
  if (typeof raw.chosen !== "number" || typeof raw.months !== "number" || options.length === 0) return null;
  const pending = raw.pending as { months?: unknown; from?: unknown } | null | undefined;
  const validPending =
    pending && typeof pending.months === "number" && typeof pending.from === "string"
      ? { months: pending.months, from: pending.from }
      : null;
  return { chosen: raw.chosen, months: raw.months, pending: validPending, options };
}

/**
 * The period as it stands `now`. A waiting change whose date has passed has
 * applied, even when the phone has not heard from the server since.
 */
export function historyNow(history: HomeHistory, now = new Date()): HomeHistory {
  if (history.pending && new Date(history.pending.from).getTime() <= now.getTime()) {
    return { ...history, months: history.chosen, pending: null };
  }
  return history;
}

/** The host chooses `next`: what the server will answer (spec 4.3), shown at once. */
export function chooseHistory(history: HomeHistory, next: number, now = new Date()): HomeHistory {
  const current = historyNow(history, now);
  if (next === current.chosen) return current;
  if (next < current.months) {
    return {
      ...current,
      chosen: next,
      pending: { months: next, from: new Date(now.getTime() + HISTORY_NOTICE_DAYS * DAY_MS).toISOString() },
    };
  }
  return { ...current, chosen: next, months: next, pending: null };
}

/** Whether choosing `next` would wait (and so asks first). */
export function shortens(history: HomeHistory, next: number, now = new Date()) {
  const current = historyNow(history, now);
  return next !== current.chosen && next < current.months;
}

/** When a shorter period chosen `now` would apply. */
export function noticeEnd(now = new Date()) {
  return new Date(now.getTime() + HISTORY_NOTICE_DAYS * DAY_MS);
}

/**
 * The first day kept once `months` applies on `from`: the first of (the month
 * of `from`, minus `months`), on this phone's clock. Purchases before it go.
 */
export function keptFrom(from: Date | string, months: number) {
  const date = new Date(from);
  return new Date(date.getFullYear(), date.getMonth() - months, 1);
}

function intlLocale(locale: string) {
  return locale === "ar" ? "ar" : "en";
}

/** "Dec 24" in English ("Dec 24, 2027" in another year), like the other History dates. */
export function shortDate(date: Date | string, locale: string, now = new Date()) {
  const value = new Date(date);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    ...(value.getFullYear() !== now.getFullYear() ? { year: "numeric" } : null),
  }).format(value);
}

/** "December 24" in English ("September 1, 2025" in another year). */
export function longDate(date: Date | string, locale: string, now = new Date()) {
  const value = new Date(date);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    ...(value.getFullYear() !== now.getFullYear() ? { year: "numeric" } : null),
  }).format(value);
}

/** Closing the History notice is remembered per waiting change: a new change shows it again. */
export function noticeKey(history: HomeHistory | null | undefined) {
  return history?.pending ? history.pending.from : null;
}
