import { MOCK_PURCHASES } from "@/constants/mock-data";
import type { Purchase, PurchaseStatus } from "@/types/purchase";

type UsePurchasesResult = {
  purchases: Purchase[];
  needed: Purchase[];
  bought: Purchase[];
  getById: (id: string) => Purchase | undefined;
  isLoading: boolean;
};

/** Placeholder until a real data layer is added. */
export function usePurchases(): UsePurchasesResult {
  const purchases = MOCK_PURCHASES;

  return {
    purchases,
    needed: purchases.filter((item) => item.status === "needed"),
    bought: purchases.filter((item) => item.status === "bought"),
    getById: (id) => purchases.find((item) => item.id === id),
    isLoading: false,
  };
}

export function filterPurchasesByStatus(
  purchases: Purchase[],
  status: PurchaseStatus,
) {
  return purchases.filter((item) => item.status === status);
}
