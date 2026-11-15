import type { Item, ItemCategory } from "../../entities/item.entity";

export type NewItemInput = {
  homeId: string;
  listId: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
  notes: string | null;
  status: "needed" | "bought";
  urgent: boolean;
  urgentBeforeBought?: boolean;
  addedBy: string;
  boughtBy: string | null;
  boughtAt: Date | null;
};

export type ItemPatch = Partial<
  Pick<Item, "name" | "quantity" | "category" | "urgent" | "notes" | "unit" | "cost" | "listId">
>;

export interface IItemsRepository {
  findByHome(homeId: string): Promise<Item[]>;
  insert(input: NewItemInput): Promise<Item>;
  /**
   * Writes only these columns. Never save a whole loaded item: a copy read a
   * moment ago would put back whatever someone else changed since (a "bought"
   * from the other phone, a new order).
   */
  patch(id: string, homeId: string, changes: ItemPatch): Promise<number>;
  /** The same for many items, and only those still needed. Returns rows changed. */
  patchNeeded(ids: string[], homeId: string, changes: ItemPatch): Promise<number>;
  findInHome(itemId: string, homeId: string): Promise<Item | null>;
  countInHome(ids: string[], homeId: string): Promise<number>;
  markNeededBought(
    id: string,
    homeId: string,
    userId: string,
    boughtAt: Date,
    cost: number | null,
  ): Promise<number>;
  markNeededBoughtMany(
    homeId: string,
    userId: string,
    boughtAt: Date,
    entries: { id: string; cost: number | null }[],
  ): Promise<number>;
  /** Sets or clears the "not found" mark on a needed item. Returns rows changed. */
  setNotFound(id: string, homeId: string, userId: string | null, at: Date | null): Promise<number>;
  deleteInHome(ids: string[], homeId: string): Promise<void>;
  findNeededByIds(ids: string[], homeId: string): Promise<Item[]>;
  deleteNeededOnList(homeId: string, listId: string): Promise<void>;
  findNeeded(homeId: string): Promise<Item[]>;
  placeNeeded(
    homeId: string,
    itemId: string,
    slot: "top" | "after-urgent",
    listId?: string,
  ): Promise<void>;
  applyNeededOrder(homeId: string, ids: string[]): Promise<boolean>;
  reassignCategory(homeId: string, categoryId: string, fallback: string): Promise<void>;
  findUserNames(ids: string[]): Promise<{ id: string; name: string }[]>;
  findUserName(userId: string): Promise<string | null>;
}

export const ITEMS_REPOSITORY = Symbol("ITEMS_REPOSITORY");
