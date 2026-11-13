import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, type Repository } from "typeorm";
import { DomainError } from "../../../common/domain.error";
import { HomesService } from "../../homes/services/homes.service";
import { NotificationsService } from "../../notifications/services/notifications.service";
import type { ItemCategory } from "../entities/item.entity";
import { Item } from "../entities/item.entity";
import { TripReceipt } from "../entities/trip-receipt.entity";
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
  /** Trip receipt this item was priced under (trip-total mode). */
  receiptId: string | null;
  receiptTotal: number | null;
  /** The invoice's name (e.g. the shop), if one was given. */
  receiptName: string | null;
  /** Photo id; load it from GET /item-images/:imageId. */
  imageId: string | null;
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
    @InjectRepository(TripReceipt) private readonly receipts: Repository<TripReceipt>,
    @InjectRepository(Item) private readonly itemRows: Repository<Item>,
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
      this.notifications.notifyItemAdded({
        homeId,
        actorId: userId,
        actorName: view.addedByName,
        itemName: view.name,
        urgent: view.urgent,
        listId: view.listId,
      });
    }
    return view;
  }

  async updateDetails(
    userId: string,
    itemId: string,
    input: {
      name: string;
      quantity: number;
      category: ItemCategory;
      urgent: boolean;
      notes?: string;
      unit?: string;
    },
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
    if (input.unit !== undefined) {
      item.unit = blankToNull(input.unit);
    }
    const saved = await this.items.save(item);
    if (becameUrgent) {
      await this.items.placeNeeded(saved.homeId, saved.id, "top", saved.listId);
    }
    const [view] = await this.withNames([saved]);
    if (becameUrgent) {
      const actorName = await this.items.findUserName(userId);
      this.notifications.notifyItemUrgent({
        homeId: view.homeId,
        actorId: userId,
        actorName: actorName ?? "Member",
        itemName: view.name,
        listId: view.listId,
      });
    }
    return view;
  }

  async markBought(userId: string, itemId: string, cost?: number | null, receiptId?: string) {
    const item = await this.requireItem(userId, itemId);
    // Someone else already bought it (a stale list): keep their purchase as is.
    if (item.status !== "needed") {
      const [view] = await this.withNames([item]);
      return view;
    }
    item.urgentBeforeBought = item.urgent;
    item.status = "bought";
    item.urgent = false;
    item.boughtBy = userId;
    item.boughtAt = new Date();
    item.cost = normalizeCost(cost);
    const saved = await this.items.save(item);
    if (receiptId) await this.joinReceipt(saved.homeId, [saved.id], receiptId, item.boughtAt);
    const [view] = await this.withNames([await this.itemRows.findOneOrFail({ where: { id: saved.id } })]);
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
    const receiptId = item.receiptId;
    const cost = item.cost === null || item.cost === undefined ? null : Number(item.cost);
    // One step, and only while it's still bought: a double tap or a second
    // phone can't take its price off the invoice twice.
    await this.receipts.manager.transaction(async (manager) => {
      const result = await manager.update(
        Item,
        { id: item.id, status: "bought" },
        {
          status: "needed",
          listId: item.listId,
          urgent: item.urgentBeforeBought,
          urgentBeforeBought: false,
          boughtBy: null,
          boughtAt: null,
          cost: null,
          receiptId: null,
        },
      );
      if (!result.affected) {
        throw new DomainError(
          "UNDO_EXPIRED",
          "That item can no longer be moved back.",
          HttpStatus.CONFLICT,
        );
      }
      if (!receiptId) return;
      // Its own price no longer belongs to the invoice it was on.
      if (cost !== null) await this.adjustReceiptTotal(manager, receiptId, -cost);
      await this.deleteIfEmpty(manager, receiptId);
    });
    const saved = await this.itemRows.findOneOrFail({ where: { id: item.id } });
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
    const previous = item.cost === null || item.cost === undefined ? 0 : Number(item.cost);
    item.cost = normalizeCost(cost);
    const next = item.cost === null || item.cost === undefined ? 0 : Number(item.cost);
    // Its price is part of its invoice's total, so the total follows the change.
    if (item.receiptId && next !== previous) {
      const receiptId = item.receiptId;
      await this.receipts.manager.transaction(async (manager) => {
        await manager.update(Item, { id: item.id }, { cost: item.cost });
        await this.adjustReceiptTotal(manager, receiptId, next - previous);
      });
      const [view] = await this.withNames([await this.itemRows.findOneOrFail({ where: { id: item.id } })]);
      return view;
    }
    const saved = await this.items.save(item);
    const [view] = await this.withNames([saved]);
    return view;
  }

  /**
   * Record one total for a finished trip. Links the given bought items to it so
   * history can show the trip as a single invoice.
   */
  async createReceipt(
    userId: string,
    homeId: string,
    input: { total?: number | null; name?: string | null; itemIds: string[]; listId?: string | null },
  ) {
    await this.homes.requireMembership(userId, homeId);
    const total = normalizeCost(input.total);
    const ids = [...new Set(input.itemIds)];
    const rows = ids.length
      ? await this.itemRows.find({ where: { id: In(ids), homeId, status: "bought" } })
      : [];
    if (rows.length === 0) {
      throw new DomainError("ITEM_NOT_FOUND", "No bought items for this trip.", HttpStatus.BAD_REQUEST);
    }
    // The list comes from the items themselves (never trust a client list id).
    const listId = rows[0]?.listId ?? null;
    const itemIds = rows.map((row) => row.id);
    const previousReceiptIds = [
      ...new Set(rows.map((row) => row.receiptId).filter((id): id is string => Boolean(id))),
    ];
    // Re-entering a total keeps the invoice's name unless a new one is given.
    const previousName =
      previousReceiptIds.length > 0
        ? ((await this.receipts.findOne({ where: { id: previousReceiptIds[0] } }))?.name ?? null)
        : null;
    const name = input.name === undefined ? previousName : blankToNull(input.name ?? undefined);
    // The same invoice re-priced (all its items, nothing else): update it in
    // place, so its id, name and date stay the same.
    if (previousReceiptIds.length === 1 && rows.every((row) => row.receiptId === previousReceiptIds[0])) {
      const others = await this.itemRows.count({
        where: { receiptId: previousReceiptIds[0], id: Not(In(itemIds)) },
      });
      const existing = others === 0
        ? await this.receipts.findOne({ where: { id: previousReceiptIds[0], homeId } })
        : null;
      if (existing) {
        existing.total = total;
        existing.name = name;
        const saved = await this.receipts.save(existing);
        return {
          receipt: {
            id: saved.id,
            listId: saved.listId,
            total: saved.total,
            name: saved.name,
            createdAt: saved.createdAt,
          },
          items: await this.withNames(rows),
        };
      }
    }
    // One transaction: never leave a receipt without items or items half-moved.
    const receipt = await this.receipts.manager.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(TripReceipt, { homeId, listId, total, name, createdBy: userId }),
      );
      await manager.update(Item, { id: In(itemIds) }, { receiptId: saved.id });
      // Re-entering a trip's total replaces its old receipt: drop receipts that
      // no longer have any items.
      if (previousReceiptIds.length > 0) {
        await manager.query(
          `delete from trip_receipts r
            where r.id = any($1::uuid[])
              and not exists (select 1 from items i where i.receipt_id = r.id)`,
          [previousReceiptIds],
        );
      }
      return saved;
    });
    const updated = await this.itemRows.find({ where: { id: In(rows.map((row) => row.id)) } });
    return {
      receipt: {
        id: receipt.id,
        listId: receipt.listId,
        total: receipt.total,
        name: receipt.name,
        createdAt: receipt.createdAt,
      },
      items: await this.withNames(updated),
    };
  }

  async renameReceipt(userId: string, receiptId: string, name: string | null) {
    const receipt = await this.requireReceipt(userId, receiptId);
    receipt.name = blankToNull(name ?? undefined);
    const saved = await this.receipts.save(receipt);
    return { id: saved.id, name: saved.name, total: saved.total };
  }

  /**
   * Move one bought item to another invoice from the same month. Its own price
   * (if it has one) moves with it; an invoice left with no items is removed.
   */
  async moveToReceipt(userId: string, itemId: string, receiptId: string, utcOffsetMin = 0) {
    const item = await this.requireItem(userId, itemId);
    if (item.status !== "bought" || !item.boughtAt) {
      throw new DomainError("ITEM_NOT_BOUGHT", "Only bought items can be moved.", HttpStatus.BAD_REQUEST);
    }
    const target = await this.receipts.findOne({ where: { id: receiptId, homeId: item.homeId } });
    if (!target) {
      throw new DomainError("RECEIPT_NOT_FOUND", "Invoice not found", HttpStatus.NOT_FOUND);
    }
    if (item.receiptId === target.id) {
      const [view] = await this.withNames([item]);
      return view;
    }

    const targetItems = await this.itemRows.find({ where: { receiptId: target.id } });
    const targetStart = targetItems
      .map((row) => row.boughtAt)
      .filter((date): date is Date => Boolean(date))
      .reduce<Date>((earliest, date) => (date < earliest ? date : earliest), target.createdAt);
    if (monthKey(targetStart, utcOffsetMin) !== monthKey(item.boughtAt, utcOffsetMin)) {
      throw new DomainError(
        "RECEIPT_OTHER_MONTH",
        "Items can only move between invoices of the same month.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const source = item.receiptId;
    const cost = item.cost === null || item.cost === undefined ? null : Number(item.cost);
    await this.receipts.manager.transaction(async (manager) => {
      await manager.update(Item, { id: item.id }, { receiptId: target.id });
      if (cost !== null) {
        if (source) await this.adjustReceiptTotal(manager, source, -cost);
        await this.adjustReceiptTotal(manager, target.id, cost);
      }
      if (source) await this.deleteIfEmpty(manager, source);
    });

    const [view] = await this.withNames([await this.itemRows.findOneOrFail({ where: { id: item.id } })]);
    return view;
  }

  /** Items bought outside a trip join an invoice; their own prices add to its total. */
  private async joinReceipt(homeId: string, itemIds: string[], receiptId: string, boughtAt: Date) {
    const receipt = await this.receipts.findOne({ where: { id: receiptId, homeId } });
    // A stale invoice (deleted meanwhile) just leaves the items loose.
    if (!receipt) return;
    await this.receipts.manager.transaction(async (manager) => {
      const rows = await manager.find(Item, {
        where: { id: In(itemIds), homeId, status: "bought" },
      });
      // Only what this request just bought; never older purchases sent by a stale list.
      const joining = rows.filter(
        (row) => !row.receiptId && row.boughtAt?.getTime() === boughtAt.getTime(),
      );
      if (joining.length === 0) return;
      await manager.update(Item, { id: In(joining.map((row) => row.id)) }, { receiptId });
      const added = joining.reduce(
        (sum, row) => sum + (row.cost === null || row.cost === undefined ? 0 : Number(row.cost)),
        0,
      );
      if (added > 0) await this.adjustReceiptTotal(manager, receiptId, added);
    });
  }

  private async deleteIfEmpty(manager: TripReceiptManager, receiptId: string) {
    await manager.query(
      `delete from trip_receipts r
        where r.id = $1
          and not exists (select 1 from items i where i.receipt_id = r.id)`,
      [receiptId],
    );
  }

  /** Adds (or removes) an amount; an invoice without a total stays without one. */
  private async adjustReceiptTotal(
    manager: TripReceiptManager,
    receiptId: string,
    amount: number,
  ) {
    await manager.query(
      `update trip_receipts
          set total = round(greatest(total + $2::numeric, 0), 3)
        where id = $1 and total is not null`,
      [receiptId, amount],
    );
  }

  private async requireReceipt(userId: string, receiptId: string) {
    const receipt = await this.receipts.findOne({ where: { id: receiptId } });
    if (!receipt) {
      throw new DomainError("RECEIPT_NOT_FOUND", "Invoice not found", HttpStatus.NOT_FOUND);
    }
    await this.homes.requireMembership(userId, receipt.homeId);
    return receipt;
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
    receiptId?: string,
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
    const updated = await this.items.markNeededBoughtMany(
      membership.homeId,
      userId,
      now,
      uniqueIds.map((id) => ({ id, cost: normalizeCost(unique.get(id)) })),
    );
    if (receiptId) await this.joinReceipt(membership.homeId, uniqueIds, receiptId, now);
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

  async setManyUrgent(userId: string, ids: string[], urgent: boolean) {
    const uniqueIds = [...new Set(ids)];
    const membership = await this.homes.requireMembership(userId);
    const rows = await this.items.findNeededByIds(uniqueIds, membership.homeId);
    if (rows.length !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    const became: Item[] = [];
    for (const item of rows) {
      if (item.urgent === urgent) continue;
      item.urgent = urgent;
      const saved = await this.items.save(item);
      if (urgent) became.push(saved);
    }

    for (const item of became) {
      await this.items.placeNeeded(item.homeId, item.id, "top", item.listId);
    }

    if (became.length > 0) {
      const actorName = (await this.items.findUserName(userId)) ?? "Member";
      // Queued per person, so a bulk mark arrives as one grouped notification.
      for (const item of became) {
        this.notifications.notifyItemUrgent({
          homeId: item.homeId,
          actorId: userId,
          actorName,
          itemName: item.name,
          listId: item.listId,
        });
      }
    }

    return { updated: uniqueIds.length };
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
    await this.pins.moveOffList(homeId, listId);
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

  /** The item as the app sees it, after checking the user may touch it. */
  async view(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    const [view] = await this.withNames([item]);
    return view;
  }

  async requireItem(userId: string, itemId: string) {
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
    const receiptIds = [...new Set(rows.map((row) => row.receiptId).filter((id): id is string => Boolean(id)))];
    const receiptRows = receiptIds.length
      ? await this.receipts.find({ where: { id: In(receiptIds) } })
      : [];
    const receiptsById = new Map(receiptRows.map((receipt) => [receipt.id, receipt]));

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
      receiptId: row.receiptId ?? null,
      receiptTotal: receiptAmount(row.receiptId ? receiptsById.get(row.receiptId) : undefined),
      receiptName: (row.receiptId ? receiptsById.get(row.receiptId)?.name : null) ?? null,
      imageId: row.imageId ?? null,
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

type TripReceiptManager = Repository<TripReceipt>["manager"];

function receiptAmount(receipt: TripReceipt | undefined) {
  if (!receipt || receipt.total === null || receipt.total === undefined) return null;
  const value = Number(receipt.total);
  return Number.isFinite(value) ? value : null;
}

/** Calendar month of a date in the user's time zone, e.g. "2026-11". */
export function monthKey(date: Date, utcOffsetMin: number) {
  const local = new Date(date.getTime() + utcOffsetMin * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeCost(cost: number | null | undefined): number | null {
  if (cost === undefined || cost === null) return null;
  if (!Number.isFinite(cost) || cost < 0) {
    throw new DomainError("INVALID_COST", "Enter a valid cost.", HttpStatus.BAD_REQUEST);
  }
  return Math.round(cost * 1000) / 1000;
}
