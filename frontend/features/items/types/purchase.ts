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
  /** Who added it (user id), to tell my additions from someone else's. */
  addedById?: string;
  boughtByName?: string;
  /** Who bought it (user id), to tell my purchases from a partner's. */
  boughtById?: string;
  /** Marked "couldn't find it" on a trip; cleared when bought or at the next trip. */
  notFoundAt?: string;
  notFoundById?: string;
  notFoundByName?: string;
  /**
   * On the Later shelf since this moment: still wanted, but off the list (not
   * counted, not shopped) until it comes back.
   */
  laterAt?: string;
  /** When it returns by itself; missing = only when someone brings it back. */
  laterUntil?: string;
  createdAt: string;
  boughtAt?: string;
};
