import { useQuery } from "@tanstack/react-query";
import type { Purchase } from "@/features/items/types/purchase";
import { qk, queryClient, readCache } from "@/features/offline/query-client";
import type { Product } from "@/features/sync/types";

const NONE: Product[] = [];

/** The home's products, as the last sync brought them (see features/sync/engine). */
export function useProducts(homeId: string | null | undefined): Product[] {
  const { data } = useQuery<Product[]>(
    {
      queryKey: qk.products(homeId ?? "none"),
      queryFn: () => readCache<Product[]>(qk.products(homeId ?? "none")) ?? NONE,
      enabled: false,
    },
    queryClient,
  );
  return homeId ? (data ?? NONE) : NONE;
}

/**
 * Products as remembered purchases, so the existing helpers (suggestItems,
 * lastPrices, lastPrice) give the same answers they gave from the whole
 * history: one row for the last purchase (name, category, unit, when) and,
 * when it was ever priced, one row for the last priced purchase.
 */
export function productLines(products: Product[]): Purchase[] {
  const rows: Purchase[] = [];
  for (const product of products) {
    rows.push({
      id: `product:${product.id}`,
      name: product.name,
      quantity: 1,
      unit: product.unit ?? undefined,
      category: product.category,
      status: "bought",
      urgent: false,
      cost: null,
      addedByName: "",
      createdAt: product.lastBoughtAt,
      boughtAt: product.lastBoughtAt,
    });
    if (product.lastCost !== null && product.lastCostAt) {
      rows.push({
        id: `product-price:${product.id}`,
        name: product.name,
        quantity: product.lastCostQuantity ?? 1,
        unit: product.lastCostUnit ?? undefined,
        category: product.category,
        status: "bought",
        urgent: false,
        cost: product.lastCost,
        addedByName: "",
        createdAt: product.lastCostAt,
        boughtAt: product.lastCostAt,
      });
    }
  }
  return rows;
}
