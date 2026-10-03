import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { DomainError } from "../../common/domain.error";
import { HomesService } from "../homes/homes.service";
import { NotificationsService } from "../notifications/notifications.service";
import { User } from "../../users/user.entity";
import type { ItemCategory } from "./item.entity";
import { ShoppingList } from "./shopping-list.entity";
import { Item } from "./item.entity";
import { applyNeededOrder, placeNeededItem } from "./item-order";
import { undoDeadline } from "./shopping";
import { CategoriesService } from "./categories.service";
import { StaplesService } from "./staples.service";

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
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ShoppingList) private readonly shoppingLists: Repository<ShoppingList>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly homes: HomesService,
    private readonly notifications: NotificationsService,
    private readonly staples: StaplesService,
    private readonly categories: CategoriesService,
  ) {}

  async list(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    await this.staples.materializeDue(homeId, userId);
    const rows = await this.items.find({
      where: { homeId },
      order: { sortOrder: "ASC", createdAt: "DESC" },
    });
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
    const item = await this.items.save(
      this.items.create({
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
      }),
    );
    await placeNeededItem(this.items, homeId, item.id, item.urgent ? "top" : "after-urgent", item.listId);
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
      await placeNeededItem(this.items, saved.homeId, saved.id, "top", saved.listId);
    }
    const [view] = await this.withNames([saved]);
    if (becameUrgent) {
      const actor = await this.users.findOne({ where: { id: userId }, select: { id: true, name: true } });
      await this.notifications.notifyItemUrgent({
        homeId: view.homeId,
        actorId: userId,
        actorName: actor?.name ?? "Member",
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
    const list = await this.shoppingLists.findOne({
      where: { id: item.listId, homeId: item.homeId },
    });
    if (!list || list.deletedAt) {
      const fallback = await this.shoppingLists.findOne({
        where: { homeId: item.homeId, deletedAt: IsNull() },
        order: { createdAt: "ASC" },
      });
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
    await placeNeededItem(
      this.items,
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
    const applied = await applyNeededOrder(this.items, membership.homeId, ids);
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
    const owned = await this.items.count({ where: { id: In(uniqueIds), homeId: membership.homeId } });
    if (owned !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    let updated = 0;
    for (const [id, cost] of unique) {
      const result = await this.items
        .createQueryBuilder()
        .update(Item)
        .set({
          status: "bought",
          urgentBeforeBought: () => "urgent",
          urgent: false,
          boughtBy: userId,
          boughtAt: now,
          cost: normalizeCost(cost),
        })
        .where("id = :id", { id })
        .andWhere("home_id = :homeId", { homeId: membership.homeId })
        .andWhere("status = :status", { status: "needed" })
        .execute();
      updated += result.affected ?? 0;
    }
    return { updated };
  }

  async removeMany(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const membership = await this.homes.requireMembership(userId);
    const owned = await this.items.count({ where: { id: In(uniqueIds), homeId: membership.homeId } });
    if (owned !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    await this.items.delete({ id: In(uniqueIds), homeId: membership.homeId });
    return { deleted: uniqueIds.length };
  }

  async moveMany(userId: string, ids: string[], listId: string) {
    const uniqueIds = [...new Set(ids)];
    const membership = await this.homes.requireMembership(userId);
    const list = await this.shoppingLists.findOne({
      where: { id: listId, homeId: membership.homeId, deletedAt: IsNull() },
    });
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }

    const rows = await this.items.find({
      where: { id: In(uniqueIds), homeId: membership.homeId, status: "needed" },
    });
    if (rows.length !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    let moved = 0;
    for (const item of rows) {
      if (item.listId === list.id) continue;
      item.listId = list.id;
      await this.items.save(item);
      await placeNeededItem(
        this.items,
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
    const rows = await this.shoppingLists.find({
      where: { homeId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
    return rows.map((row) => ({ id: row.id, homeId: row.homeId, name: row.name }));
  }

  async historyLists(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    const rows = await this.shoppingLists
      .createQueryBuilder("list")
      .innerJoin(Item, "item", "item.list_id = list.id AND item.status = :status", {
        status: "bought",
      })
      .where("list.home_id = :homeId", { homeId })
      .select("list.id", "id")
      .addSelect("list.name", "name")
      .addSelect("list.deleted_at", "deletedAt")
      .groupBy("list.id")
      .addGroupBy("list.name")
      .addGroupBy("list.deleted_at")
      .orderBy("list.deleted_at", "ASC", "NULLS FIRST")
      .addOrderBy("list.name", "ASC")
      .getRawMany<{ id: string; name: string; deletedAt: Date | string | null }>();

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
    const row = await this.shoppingLists.save(
      this.shoppingLists.create({ homeId, name: trimmed, deletedAt: null }),
    );
    return { id: row.id, homeId: row.homeId, name: row.name };
  }

  async renameList(userId: string, homeId: string, listId: string, name: string) {
    await this.homes.requireMembership(userId, homeId);
    const list = await this.shoppingLists.findOne({
      where: { id: listId, homeId, deletedAt: IsNull() },
    });
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
    const count = await this.shoppingLists.count({
      where: { homeId, deletedAt: IsNull() },
    });
    if (count <= 1) {
      throw new DomainError("LAST_LIST", "Keep at least one list.", HttpStatus.BAD_REQUEST);
    }
    const list = await this.shoppingLists.findOne({
      where: { id: listId, homeId, deletedAt: IsNull() },
    });
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    // Drop open needed items; keep bought history attached to this list.
    await this.items.delete({ homeId, listId, status: "needed" });
    list.deletedAt = new Date();
    await this.shoppingLists.save(list);
    return { deleted: true };
  }

  private async resolveList(homeId: string, listId?: string) {
    const list = listId
      ? await this.shoppingLists.findOne({
          where: { id: listId, homeId, deletedAt: IsNull() },
        })
      : await this.shoppingLists.findOne({
          where: { homeId, deletedAt: IsNull() },
          order: { createdAt: "ASC" },
        });
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    return list;
  }

  private async requireItem(userId: string, itemId: string) {
    const membership = await this.homes.requireMembership(userId);
    const item = await this.items.findOne({ where: { id: itemId, homeId: membership.homeId } });
    if (!item) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    return item;
  }

  private async withNames(rows: Item[]): Promise<ItemView[]> {
    const ids = [...new Set(rows.flatMap((row) => [row.addedBy, row.boughtBy].filter((id): id is string => Boolean(id))))];
    const people = ids.length
      ? await this.users.find({ where: { id: In(ids) }, select: { id: true, name: true } })
      : [];
    const names = new Map(people.map((person) => [person.id, person.name]));
    const listIds = [...new Set(rows.map((row) => row.listId).filter(Boolean))];
    const lists = listIds.length
      ? await this.shoppingLists.find({ where: { id: In(listIds) } })
      : [];
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
