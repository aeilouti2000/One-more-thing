// `node --test` has no expo-sqlite: opening fails, so the cache falls back to
// the single saved text (row-store.test.ts tests the tables with node:sqlite).
export function openDatabaseSync() {
  throw new Error("expo-sqlite is not available in tests");
}
