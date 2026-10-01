export type PurchaseStatus = "needed" | "bought";

export type PurchaseCategory = string;

export type Purchase = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  category: PurchaseCategory;
  notes?: string;
  status: PurchaseStatus;
  urgent: boolean;
  listId?: string;
  listName?: string;
  addedByName: string;
  boughtByName?: string;
  createdAt: string;
  boughtAt?: string;
};
