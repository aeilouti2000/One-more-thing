import type { ShoppingList } from "../../entities/shopping-list.entity";

export type HistoryListRow = {
  id: string;
  name: string;
  deletedAt: Date | string | null;
};

export interface IListsRepository {
  findActive(homeId: string): Promise<ShoppingList[]>;
  findActiveById(listId: string, homeId: string): Promise<ShoppingList | null>;
  findFirstActive(homeId: string): Promise<ShoppingList | null>;
  findByIds(ids: string[]): Promise<ShoppingList[]>;
  historyWithBoughtItems(homeId: string): Promise<HistoryListRow[]>;
  insert(homeId: string, name: string): Promise<ShoppingList>;
  save(list: ShoppingList): Promise<ShoppingList>;
  countActive(homeId: string): Promise<number>;
}

export const LISTS_REPOSITORY = Symbol("LISTS_REPOSITORY");
