import { translate, type Locale } from "@/constants/i18n";
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

export const categoryKeys = {
  vegetables: "categoryVegetables",
  meat: "categoryMeat",
  coffee: "categoryCoffee",
  supermarket: "categorySupermarket",
  pharmacy: "categoryPharmacy",
  other: "categoryOther",
} as const;

export function getCategoryLabel(category: PurchaseCategory, locale?: Locale) {
  return translate(categoryKeys[category], undefined, locale);
}
