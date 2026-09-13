import type { PurchaseCategory } from "@/types/purchase";

export const PURCHASE_CATEGORIES: {
  id: PurchaseCategory;
  label: string;
}[] = [
  { id: "market", label: "Market" },
  { id: "household", label: "Home" },
  { id: "personal", label: "Personal" },
  { id: "other", label: "Other" },
];

export function getCategoryLabel(category: PurchaseCategory) {
  return (
    PURCHASE_CATEGORIES.find((item) => item.id === category)?.label ?? category
  );
}
