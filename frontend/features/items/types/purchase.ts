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
  cost?: number | null;
  /** Set when the trip was priced as one total instead of per item. */
  receiptId?: string | null;
  receiptTotal?: number | null;
  /** The invoice's name (e.g. the shop), if one was given. */
  receiptName?: string | null;
  /** Server photo id (see itemImageUrl). */
  imageId?: string | null;
  /** Local photo shown while it uploads (and until the next refresh). */
  localImageUri?: string;
  photoUploading?: boolean;
  listId?: string;
  listName?: string;
  addedByName: string;
  boughtByName?: string;
  createdAt: string;
  boughtAt?: string;
};
