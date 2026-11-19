/** Parked items come back early in the morning of their day (local time). */
const RETURN_HOUR = 6;
/** The furthest ahead the server lets an item be parked. */
export const MAX_LATER_DAYS = 365;

/** `days` from now, at the morning return hour. */
export function laterInDays(days: number, now = new Date()) {
  const span = Math.min(Math.max(Math.round(days), 1), MAX_LATER_DAYS);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + span, RETURN_HOUR);
}

export function laterTomorrow(now = new Date()) {
  return laterInDays(1, now);
}

export function laterNextWeek(now = new Date()) {
  return laterInDays(7, now);
}

/** The first day of the month after this one. */
export function laterNextMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, RETURN_HOUR);
}

/** "Sat 28 Nov": short enough for a row, in the reader's language. */
export function formatLaterDay(date: Date | string, locale: string) {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(value);
}
