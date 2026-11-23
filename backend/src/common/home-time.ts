/**
 * Where a home's months start. Month totals, the phone's two-month window and
 * history clean-up all follow the home's own clock, not the server's.
 */
export const DEFAULT_TIMEZONE = "Asia/Amman";

/** An IANA zone name both JavaScript and Postgres understand, e.g. "Asia/Amman". */
export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(value) && value !== "UTC") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** SQL for the zone of the home row aliased `h` (falls back to the default). */
export const HOME_TZ_SQL = `coalesce(h.timezone, '${DEFAULT_TIMEZONE}')`;
