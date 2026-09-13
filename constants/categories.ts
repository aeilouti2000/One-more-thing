import { translate } from "@/constants/i18n";
import type { PurchaseCategory } from "@/types/purchase";

export const PURCHASE_CATEGORIES: {
  id: PurchaseCategory;
}[] = [
  { id: "supermarket" },
  { id: "vegetables" },
  { id: "meat" },
  { id: "coffee" },
  { id: "pharmacy" },
  { id: "other" },
];

const categoryKeys = {
  vegetables: "categoryVegetables",
  meat: "categoryMeat",
  coffee: "categoryCoffee",
  supermarket: "categorySupermarket",
  pharmacy: "categoryPharmacy",
  other: "categoryOther",
} as const;

export function getCategoryLabel(category: PurchaseCategory) {
  return translate(categoryKeys[category]);
}
