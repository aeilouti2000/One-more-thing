import { openDatabaseSync } from "expo-sqlite";
import type { RowDatabase } from "@/features/offline/row-store";

/**
 * The SQLite file holding the saved copy (see row-store.ts). Null when it
 * cannot be opened: the app then keeps using the single saved text, as before.
 */
export function openCacheDb(): RowDatabase | null {
  try {
    const db = openDatabaseSync("omt-cache.db");
    return {
      execSync: (sql) => db.execSync(sql),
      runSync: (sql, params) => db.runSync(sql, params),
      getAllSync: <T,>(sql: string, params: (string | number | null)[] = []) => db.getAllSync<T>(sql, params),
      withTransactionSync: (work) => db.withTransactionSync(work),
    };
  } catch {
    return null;
  }
}
