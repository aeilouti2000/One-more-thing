import type { HomeCategory } from "@/features/items/api/categories";
import type { ItemResponse } from "@/features/items/api/items";
import type { HomeList } from "@/features/items/api/lists";
import type { PinResponse } from "@/features/items/api/pins";
import type { SetResponse } from "@/features/items/api/sets";
import type { ShopAsk } from "@/features/items/api/shop-asks";
import type { ShopLock } from "@/features/items/api/shop-locks";

/** A product the home has bought before (backend home_products). */
export type Product = {
  id: string;
  name: string;
  nameKey: string;
  category: string;
  unit: string | null;
  lastCost: number | null;
  lastCostQuantity: number | null;
  lastCostUnit: string | null;
  lastCostAt: string | null;
  lastBoughtAt: string;
  timesBought: number;
};

/** A shopping trip inside the phone's window. */
export type Trip = {
  id: string;
  listId: string | null;
  name: string | null;
  total: number | null;
  startedAt: string;
  lastBoughtAt: string;
};

/** An icon the home chose for a category or a shop (backend home_icons). */
export type HomeIconRow = {
  kind: "category" | "shop";
  key: string;
  label: string | null;
  emoji: string | null;
  imageId: string | null;
};

/** What the phone keeps about its last sync, saved with the copy it describes. */
export type SyncState = { version: number; windowStart: string };

/** GET /homes/:homeId/changes. With nothing changed only version and full come back. */
export type ChangesAnswer = {
  version: number;
  full: boolean;
  windowStart?: string;
  home?: unknown;
  lists?: HomeList[];
  categories?: HomeCategory[];
  pins?: PinResponse[];
  sets?: SetResponse[];
  asks?: ShopAsk[];
  locks?: ShopLock[];
  icons?: HomeIconRow[];
  items?: ItemResponse[];
  products?: Product[];
  trips?: Trip[];
  deleted?: { type: "item" | "product" | "trip"; id: string }[];
};
