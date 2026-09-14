export type PurchaseStatus = "needed" | "bought";

export type PurchaseCategory =
  | "vegetables"
  | "meat"
  | "supermarket"
  | "pharmacy"
  | "coffee"
  | "other";

export type Purchase = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  category: PurchaseCategory;
  notes?: string;
  status: PurchaseStatus;
  addedByName: string;
  boughtByName?: string;
  createdAt: string;
  boughtAt?: string;
};
