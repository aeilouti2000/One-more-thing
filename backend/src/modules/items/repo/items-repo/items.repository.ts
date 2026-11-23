import type { EntityManager } from "typeorm";
import type { Item, ItemCategory } from "../../entities/item.entity";

export type NewItemInput = {
  /** Made on the phone; left out, the database makes one. */
  id?: string;
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
    /** Runs inside this transaction when given. */
    manager?: EntityManager,
  ): Promise<number>;
  markNeededBoughtMany(
    homeId: string,
    userId: string,
    boughtAt: Date,
    entries: { id: string; cost: number | null }[],
    manager?: EntityManager,
  ): Promise<number>;
  /** Sets or clears the "not found" mark on a needed item. Returns rows changed. */
  setNotFound(id: string, homeId: string, userId: string | null, at: Date | null): Promise<number>;
  /**
   * Parks needed items on the Later shelf (at + until), or brings them back
   * (at: null). Returns rows changed.
   */
  setLater(ids: string[], homeId: string, at: Date | null, until: Date | null): Promise<number>;
  /**
   * Brings back every parked item whose day has come, in one statement, so two
   * servers (or the timer and a request) never release the same item twice.
   * With a homeId only that home is checked.
   */
  releaseDueLater(homeId?: string): Promise<{ id: string; homeId: string; listId: string; name: string }[]>;
  /** Several new needed items in one statement, in the order given. */
  insertMany(inputs: NewItemInput[]): Promise<Item[]>;
  /** Puts these needed items, in this order, right after the list's urgent ones. */
  placeNeededMany(homeId: string, itemIds: string[], listId: string): Promise<void>;
  /** The newest item with this name in the home, any status (case-insensitive). */
  findLatestByName(homeId: string, name: string): Promise<Item | null>;
  /** How many items each person added to a list of the home since a moment. */
  countAddedSince(
    homeId: string,
    listId: string,
    since: Date,
  ): Promise<{ userId: string; count: number }[]>;
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
