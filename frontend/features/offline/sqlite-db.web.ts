import type { RowDatabase } from "@/features/offline/row-store";

/** The web build keeps the single saved text (browser localStorage). */
export function openCacheDb(): RowDatabase | null {
  return null;
}
