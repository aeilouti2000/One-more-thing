/**
 * The key two item names are compared by: no case, no extra spaces, no Arabic
 * diacritics or tatweel. It must give exactly what the app's normalizeName
 * gives (frontend/features/items/utils/insights.ts): both test suites check the
 * same list of names (name-key.cases.json).
 */
export function nameKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ");
}
