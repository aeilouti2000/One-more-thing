import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../common/domain.error";
import { HomesService } from "../../homes/services/homes.service";
import { NotificationsService } from "../../notifications/services/notifications.service";
import type { ItemCategory } from "../entities/item.entity";
import { Item } from "../entities/item.entity";
import { ITEMS_REPOSITORY, type IItemsRepository } from "../repo/items-repo/items.repository";
import { LISTS_REPOSITORY, type IListsRepository } from "../repo/lists-repo/lists.repository";
import { undoDeadline } from "../utils/shopping";
import { CategoriesService } from "./categories.service";
import { PinsService } from "./pins.service";

export type ItemView = {
  id: string;
  homeId: string;
  listId: string;
  listName: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
  notes: string | null;
  status: "needed" | "bought";
  urgent: boolean;
  cost: number | null;
  addedBy: string;
  boughtBy: string | null;
  addedByName: string;
  boughtByName: string | null;
  createdAt: Date;
  boughtAt: Date | null;
};

@Injectable()
export class ItemsService {
  constructor(
    @Inject(ITEMS_REPOSITORY) private readonly items: IItemsRepository,
    @Inject(LISTS_REPOSITORY) private readonly shoppingLists: IListsRepository,
    private readonly homes: HomesService,
    private readonly notifications: NotificationsService,
    private readonly pins: PinsService,
    private readonly categories: CategoriesService,
  ) {}

  async list(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    await this.pins.materializeDue(homeId);
    const rows = await this.items.findByHome(homeId);
    return this.withNames(rows);
  }

  async add(
    userId: string,
    homeId: string,
    input: { name: string; quantity: number; category: ItemCategory; unit?: string; notes?: string; urgent?: boolean; listId?: string },
    options?: { notify?: boolean },
  ) {
    await this.homes.requireMembership(userId, homeId);
    await this.categories.assertUsable(homeId, input.category);
    const list = await this.resolveList(homeId, input.listId);
    const item = await this.items.insert({
      homeId,
      listId: list.id,
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
      unit: blankToNull(input.unit),
      notes: blankToNull(input.notes),
      status: "needed",
      urgent: input.urgent === true,
      addedBy: userId,
      boughtBy: null,
      boughtAt: null,
    });
    await this.items.placeNeeded(homeId, item.id, item.urgent ? "top" : "after-urgent", item.listId);
    const [view] = await this.withNames([item]);
    if (options?.notify !== false) {
      await this.notifications.notifyItemAdded({
        homeId,
        actorId: userId,
        actorName: view.addedByName,
        itemName: view.name,
        urgent: view.urgent,
      });
    }
    return view;
  }

  async updateDetails(
    userId: string,
    itemId: string,
    input: { name: string; quantity: number; category: ItemCategory; urgent: boolean; notes?: string },
  ) {
    const item = await this.requireItem(userId, itemId);
    await this.categories.assertUsable(item.homeId, input.category);
    const becameUrgent = !item.urgent && input.urgent && item.status === "needed";
    item.name = input.name.trim();
    item.quantity = input.quantity;
    item.category = input.category;
    item.urgent = input.urgent;
    if (input.notes !== undefined) {
      item.notes = blankToNull(input.notes);
    }
    const saved = await this.items.save(item);
    if (becameUrgent) {
      await this.items.placeNeeded(saved.homeId, saved.id, "top", saved.listId);
    }
    const [view] = await this.withNames([saved]);
    if (becameUrgent) {
      const actorName = await this.items.findUserName(userId);
      await this.notifications.notifyItemUrgent({
        homeId: view.homeId,
        actorId: userId,
        actorName: actorName ?? "Member",
        itemName: view.name,
      });
    }
    return view;
  }

  async markBought(userId: string, itemId: string, cost?: number | null) {
    const item = await this.requireItem(userId, itemId);
    item.urgentBeforeBought = item.urgent;
    item.status = "bought";
    item.urgent = false;
    item.boughtBy = userId;
    item.boughtAt = new Date();
    item.cost = normalizeCost(cost);
    const saved = await this.items.save(item);
    const [view] = await this.withNames([saved]);
    return view;
  }

  async undoBought(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    if (item.status !== "bought" || !item.boughtAt || !undoDeadline(item.boughtAt)) {
      throw new DomainError(
        "UNDO_EXPIRED",
        "That item can no longer be moved back.",
        HttpStatus.CONFLICT,
      );
    }
    const list = await this.shoppingLists.findActiveById(item.listId, item.homeId);
    if (!list || list.deletedAt) {
      const fallback = await this.shoppingLists.findFirstActive(item.homeId);
      if (!fallback) {
        throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
      }
      item.listId = fallback.id;
    }
    item.status = "needed";
    item.urgent = item.urgentBeforeBought;
    item.urgentBeforeBought = false;
    item.boughtBy = null;
    item.boughtAt = null;
    item.cost = null;
    const saved = await this.items.save(item);
    await this.items.placeNeeded(
      saved.homeId,
      saved.id,
      saved.urgent ? "top" : "after-urgent",
      saved.listId,
    );
    const [view] = await this.withNames([saved]);
    return view;
  }

  async updateCost(userId: string, itemId: string, cost: number | null) {
    const item = await this.requireItem(userId, itemId);
    if (item.status !== "bought") {
      throw new DomainError(
        "ITEM_NOT_BOUGHT",
        "Only bought items can have a cost.",
        HttpStatus.BAD_REQUEST,
      );
    }
    item.cost = normalizeCost(cost);
    const saved = await this.items.save(item);
    const [view] = await this.withNames([saved]);
    return view;
  }

  async reorder(userId: string, ids: string[]) {
    const membership = await this.homes.requireMembership(userId);
    const applied = await this.items.applyNeededOrder(membership.homeId, ids);
    if (!applied) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    return { updated: ids.length };
  }

  async markManyBought(
    userId: string,
    entries: { id: string; cost?: number | null }[],
  ) {
    const unique = new Map<string, number | null | undefined>();
    for (const entry of entries) {
      unique.set(entry.id, entry.cost);
    }
    const uniqueIds = [...unique.keys()];
    const membership = await this.homes.requireMembership(userId);
    const owned = await this.items.countInHome(uniqueIds, membership.homeId);
    if (owned !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    let updated = 0;
    for (const [id, cost] of unique) {
      updated += await this.items.markNeededBought(
        id,
        membership.homeId,
        userId,
        now,
        normalizeCost(cost),
      );
    }
    return { updated };
  }

  async removeMany(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const membership = await this.homes.requireMembership(userId);
    const owned = await this.items.countInHome(uniqueIds, membership.homeId);
    if (owned !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    await this.items.deleteInHome(uniqueIds, membership.homeId);
    return { deleted: uniqueIds.length };
  }

  async moveMany(userId: string, ids: string[], listId: string) {
    const uniqueIds = [...new Set(ids)];
    const membership = await this.homes.requireMembership(userId);
    const list = await this.shoppingLists.findActiveById(listId, membership.homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }

    const rows = await this.items.findNeededByIds(uniqueIds, membership.homeId);
    if (rows.length !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    let moved = 0;
    for (const item of rows) {
      if (item.listId === list.id) continue;
      item.listId = list.id;
      await this.items.save(item);
      await this.items.placeNeeded(
        membership.homeId,
        item.id,
        item.urgent ? "top" : "after-urgent",
        list.id,
      );
      moved += 1;
    }
    return { moved, listId: list.id };
  }

  async lists(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    const rows = await this.shoppingLists.findActive(homeId);
    return rows.map((row) => ({ id: row.id, homeId: row.homeId, name: row.name }));
  }

  async historyLists(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    const rows = await this.shoppingLists.historyWithBoughtItems(homeId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      deleted: row.deletedAt != null,
    }));
  }

  async createList(userId: string, homeId: string, name: string) {
    await this.homes.requireMembership(userId, homeId);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new DomainError("LIST_NAME_REQUIRED", "Enter a list name.", HttpStatus.BAD_REQUEST);
    }
    const row = await this.shoppingLists.insert(homeId, trimmed);
    return { id: row.id, homeId: row.homeId, name: row.name };
  }

  async renameList(userId: string, homeId: string, listId: string, name: string) {
    await this.homes.requireMembership(userId, homeId);
    const list = await this.shoppingLists.findActiveById(listId, homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    const trimmed = name.trim();
    if (!trimmed) {
      throw new DomainError("LIST_NAME_REQUIRED", "Enter a list name.", HttpStatus.BAD_REQUEST);
    }
    list.name = trimmed;
    const row = await this.shoppingLists.save(list);
    return { id: row.id, homeId: row.homeId, name: row.name };
  }

  async deleteList(userId: string, homeId: string, listId: string) {
    await this.homes.requireMembership(userId, homeId);
    const count = await this.shoppingLists.countActive(homeId);
    if (count <= 1) {
      throw new DomainError("LAST_LIST", "Keep at least one list.", HttpStatus.BAD_REQUEST);
    }
    const list = await this.shoppingLists.findActiveById(listId, homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    await this.items.deleteNeededOnList(homeId, listId);
    list.deletedAt = new Date();
    await this.shoppingLists.save(list);
    return { deleted: true };
  }

  private async resolveList(homeId: string, listId?: string) {
    const list = listId
      ? await this.shoppingLists.findActiveById(listId, homeId)
      : await this.shoppingLists.findFirstActive(homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    return list;
  }

  private async requireItem(userId: string, itemId: string) {
    const membership = await this.homes.requireMembership(userId);
    const item = await this.items.findInHome(itemId, membership.homeId);
    if (!item) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    return item;
  }

  private async withNames(rows: Item[]): Promise<ItemView[]> {
    const ids = [...new Set(rows.flatMap((row) => [row.addedBy, row.boughtBy].filter((id): id is string => Boolean(id))))];
    const people = ids.length ? await this.items.findUserNames(ids) : [];
    const names = new Map(people.map((person) => [person.id, person.name]));
    const listIds = [...new Set(rows.map((row) => row.listId).filter(Boolean))];
    const lists = listIds.length ? await this.shoppingLists.findByIds(listIds) : [];
    const listNames = new Map(lists.map((list) => [list.id, list.name]));

    return rows.map((row) => ({
      id: row.id,
      homeId: row.homeId,
      listId: row.listId,
      listName: listNames.get(row.listId) ?? "List",
      name: row.name,
      quantity: Number(row.quantity),
      unit: row.unit,
      category: row.category,
      notes: row.notes,
      status: row.status,
      urgent: row.urgent,
      cost: row.cost === null || row.cost === undefined ? null : Number(row.cost),
      addedBy: row.addedBy,
      boughtBy: row.boughtBy,
      addedByName: names.get(row.addedBy) ?? "Member",
      boughtByName: row.boughtBy ? (names.get(row.boughtBy) ?? "Member") : null,
      createdAt: row.createdAt,
      boughtAt: row.boughtAt,
    }));
  }
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeCost(cost: number | null | undefined): number | null {
  if (cost === undefined || cost === null) return null;
  if (!Number.isFinite(cost) || cost < 0) {
    throw new DomainError("INVALID_COST", "Enter a valid cost.", HttpStatus.BAD_REQUEST);
  }
  return Math.round(cost * 1000) / 1000;
}
