import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Not, type Repository } from "typeorm";
import { isUniqueViolation } from "../../../common/db-errors";
import { DomainError } from "../../../common/domain.error";
import { HomesService } from "../../homes/services/homes.service";
import { NotificationsService } from "../../notifications/services/notifications.service";
import type { ItemCategory } from "../entities/item.entity";
import { Item } from "../entities/item.entity";
import { TripReceipt } from "../entities/trip-receipt.entity";
import { ITEMS_REPOSITORY, type IItemsRepository, type ItemPatch } from "../repo/items-repo/items.repository";
import { LISTS_REPOSITORY, type IListsRepository } from "../repo/lists-repo/lists.repository";
import { undoDeadline } from "../utils/shopping";
import { CategoriesService } from "./categories.service";
import { PinsService } from "./pins.service";
import { ProductsService } from "./products.service";
import { TRIP_GAP_MS, TripsService } from "./trips.service";

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
  sortOrder: number;
  cost: number | null;
  /** Trip receipt this item was priced under (trip-total mode). */
  receiptId: string | null;
  receiptTotal: number | null;
  /** The invoice's name (e.g. the shop), if one was given. */
  receiptName: string | null;
  /** Photo id; load it from GET /item-images/:imageId. */
  imageId: string | null;
  imageHash: string | null;
  addedBy: string;
  boughtBy: string | null;
  addedByName: string;
  boughtByName: string | null;
  createdAt: Date;
  boughtAt: Date | null;
  /** Marked "couldn't find it" on a trip, by whom and when. */
  notFoundAt: Date | null;
  notFoundBy: string | null;
  notFoundByName: string | null;
  /** On the Later shelf since this moment; null = on the list. */
  laterAt: Date | null;
  /** When it returns by itself; null with laterAt = only by hand. */
  laterUntil: Date | null;
};

/** The furthest ahead an item can be parked. */
const MAX_LATER_MS = 366 * 24 * 60 * 60_000;

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
    private readonly trips: TripsService,
    private readonly products: ProductsService,
  ) {}

  async list(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    // Due pins are a bonus here (the timer adds them too): never fail the read.
    // Parked items whose day has come are returned by the timer and the cron.
    await this.pins.materializeDue(homeId).catch(() => undefined);
    const rows = await this.items.findByHome(homeId);
    return this.withNames(rows);
  }

  async add(
    userId: string,
    homeId: string,
    input: {
      /** Made on the phone: sending the same add twice gives back the first item. */
      id?: string;
      name: string;
      quantity: number;
      category: ItemCategory;
      unit?: string;
      notes?: string;
      urgent?: boolean;
      listId?: string;
    },
    options?: { notify?: boolean },
  ) {
    await this.homes.requireMembership(userId, homeId);
    const already = input.id ? await this.itemWithId(input.id, homeId) : null;
    if (already) return (await this.withNames([already]))[0];
    await this.categories.assertUsable(homeId, input.category);
    const list = await this.resolveList(homeId, input.listId);
    let item: Item;
    try {
      item = await this.items.insert({
        ...(input.id ? { id: input.id } : {}),
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
    } catch (error) {
      // The same add arrived twice at once: the other one saved it.
      const saved = input.id && isUniqueViolation(error) ? await this.itemWithId(input.id, homeId) : null;
      if (!saved) throw error;
      return (await this.withNames([saved]))[0];
    }
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
      name?: string;
      quantity?: number;
      category?: ItemCategory;
      urgent?: boolean;
      notes?: string;
      unit?: string;
    },
  ) {
    const item = await this.requireItem(userId, itemId);
    if (input.category !== undefined) await this.categories.assertUsable(item.homeId, input.category);
    const needed = item.status === "needed";
    const becameUrgent = !item.urgent && input.urgent === true && needed;
    // Only what was sent: a field left out keeps whatever another phone set.
    const changes: ItemPatch = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.quantity !== undefined) changes.quantity = input.quantity;
    if (input.category !== undefined) changes.category = input.category;
    // A bought item keeps no urgent mark (it comes back with the one it had).
    if (needed && input.urgent !== undefined) changes.urgent = input.urgent;
    if (input.notes !== undefined) changes.notes = blankToNull(input.notes);
    if (input.unit !== undefined) changes.unit = blankToNull(input.unit);
    await this.items.patch(item.id, item.homeId, changes);
    const saved = await this.reload(item);
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
    const boughtAt = new Date();
    // One step, and only while it is still needed: when two people tap the same
    // item at once, only the first one buys it. The other gets the item back
    // with the real buyer (boughtBy), so the app can say who got it.
    // Bought, on a trip and counted on its product, in one step or not at all.
    if (item.status === "needed") {
      await this.itemRows.manager.transaction(async (manager) => {
        const changed = await this.items.markNeededBought(
          item.id,
          item.homeId,
          userId,
          boughtAt,
          normalizeCost(cost),
          manager,
        );
        if (changed > 0) await this.afterBought(manager, item.homeId, [item.id], boughtAt, receiptId);
      });
    }
    const [view] = await this.withNames([await this.reload(item)]);
    return view;
  }

  /** Couldn't find it in this shop: it stays needed, with a mark everyone sees. */
  async markNotFound(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    if (item.status !== "needed") {
      throw new DomainError("ITEM_ALREADY_BOUGHT", "This item was already bought.", HttpStatus.CONFLICT);
    }
    await this.items.setNotFound(item.id, item.homeId, userId, new Date());
    const [view] = await this.withNames([await this.reload(item)]);
    return view;
  }

  async clearNotFound(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    await this.items.setNotFound(item.id, item.homeId, null, null);
    const [view] = await this.withNames([await this.reload(item)]);
    return view;
  }

  /** onlyMine: a trip's Undo may only take back what this person bought. */
  async undoBought(userId: string, itemId: string, options?: { onlyMine?: boolean }) {
    const item = await this.requireItem(userId, itemId);
    if (item.status !== "bought" || !item.boughtAt || !undoDeadline(item.boughtAt)) {
      throw new DomainError(
        "UNDO_EXPIRED",
        "That item can no longer be moved back.",
        HttpStatus.CONFLICT,
      );
    }
    if (options?.onlyMine && item.boughtBy !== userId) {
      throw new DomainError(
        "UNDO_NOT_YOURS",
        "Someone else bought this item.",
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
      await this.products.purchaseUndone(manager, item.homeId, item.name);
      if (!receiptId) return;
      // Its own price no longer belongs to the invoice it was on.
      if (cost !== null) await this.adjustReceiptTotal(manager, receiptId, -cost);
      await this.deleteIfEmpty(manager, receiptId);
      await this.trips.refreshTimes(manager, [receiptId]);
    });
    const saved = await this.reload(item);
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
    const receiptId = item.receiptId;
    await this.receipts.manager.transaction(async (manager) => {
      await manager.update(Item, { id: item.id, homeId: item.homeId }, { cost: item.cost });
      if (receiptId && next !== previous) await this.adjustReceiptTotal(manager, receiptId, next - previous);
      await this.products.priceChanged(manager, item.homeId, item.name);
    });
    const [view] = await this.withNames([await this.reload(item)]);
    return view;
  }

  /**
   * Record one total for a finished trip. Links the given bought items to it so
   * history can show the trip as a single invoice.
   */
  async createReceipt(
    userId: string,
    homeId: string,
    input: {
      /** Made on the phone: the id a new invoice gets, or the invoice to re-price. */
      id?: string;
      total?: number | null;
      name?: string | null;
      itemIds: string[];
      listId?: string | null;
    },
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
    // The invoice the phone named already exists (the same request sent twice,
    // or a re-price of it): update that one and put these items on it.
    const named = input.id ? await this.receipts.findOne({ where: { id: input.id } }) : null;
    if (named) {
      if (named.homeId !== homeId) throw idTaken();
      const saved = await this.receipts.manager.transaction(async (manager) => {
        if (total !== null) named.total = total;
        if (input.name !== undefined) named.name = name;
        const kept = await manager.save(named);
        await manager.update(Item, { id: In(itemIds) }, { receiptId: kept.id });
        await this.trips.refreshTimes(manager, [kept.id]);
        const emptied = previousReceiptIds.filter((id) => id !== kept.id);
        if (emptied.length > 0) {
          await manager.query(
            `delete from trip_receipts r
              where r.id = any($1::uuid[])
                and not exists (select 1 from items i where i.receipt_id = r.id)`,
            [emptied],
          );
        }
        return kept;
      });
      const linked = await this.itemRows.find({ where: { id: In(itemIds) } });
      return {
        receipt: {
          id: saved.id,
          listId: saved.listId,
          total: saved.total,
          name: saved.name,
          createdAt: saved.createdAt,
        },
        items: await this.withNames(linked),
      };
    }
    // The same invoice re-priced (all its items, nothing else): update it in
    // place, so its id, name and date stay the same.
    if (previousReceiptIds.length === 1 && rows.every((row) => row.receiptId === previousReceiptIds[0])) {
      const others = await this.itemRows.count({
        where: { receiptId: previousReceiptIds[0], id: Not(In(itemIds)) },
      });
      const existing = others === 0
        ? await this.receipts.findOne({ where: { id: previousReceiptIds[0], homeId } })
        : null;
      // A phone that made its own id for this invoice (and may have queued a
      // rename for it while offline) must find it under that id: a trip nobody
      // priced or named is replaced below, not updated in place.
      if (existing && !(input.id && isAutoTrip(existing))) {
        // "No total" from a phone that hasn't seen the invoice yet keeps the saved one.
        if (total !== null) existing.total = total;
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
        manager.create(TripReceipt, {
          ...(input.id ? { id: input.id } : {}),
          homeId,
          listId,
          total,
          name,
          createdBy: userId,
        }),
      );
      await manager.update(Item, { id: In(itemIds) }, { receiptId: saved.id });
      await this.trips.refreshTimes(manager, [saved.id, ...previousReceiptIds]);
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
      await this.trips.refreshTimes(manager, [source, target.id]);
    });

    const [view] = await this.withNames([await this.reload(item)]);
    return view;
  }

  /**
   * What follows a purchase, in the same transaction: the items join the trip
   * the phone named (an invoice already open for this trip) or, without one,
   * the trip the 90-minute rule picks; their products count them.
   */
  private async afterBought(
    manager: TripReceiptManager,
    homeId: string,
    itemIds: string[],
    boughtAt: Date,
    receiptId?: string,
  ) {
    if (receiptId) await this.joinReceipt(manager, homeId, itemIds, receiptId, boughtAt);
    await this.trips.attachNewPurchases(manager, homeId, itemIds, boughtAt);
    const bought = await manager.find(Item, { where: { id: In(itemIds), homeId, status: "bought" } });
    await this.products.recordPurchases(
      manager,
      homeId,
      bought.filter((row) => row.boughtAt?.getTime() === boughtAt.getTime()),
    );
  }

  /** Items bought outside a trip join an invoice; their own prices add to its total. */
  private async joinReceipt(
    manager: TripReceiptManager,
    homeId: string,
    itemIds: string[],
    receiptId: string,
    boughtAt: Date,
  ) {
    const receipt = await manager.findOne(TripReceipt, { where: { id: receiptId, homeId } });
    // A stale invoice (deleted meanwhile) leaves the items to the 90-minute rule.
    if (!receipt) return;
    // The app names "this month's latest invoice" for purchases made from the
    // list. Now that every purchase has a trip, that id may be a trip nobody
    // priced or named, days old: only a real invoice, or a trip still going
    // on, takes the purchase. Anything else is left to the 90-minute rule.
    if (isAutoTrip(receipt) && boughtAt.getTime() - receipt.lastBoughtAt.getTime() > TRIP_GAP_MS) return;
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
    await this.trips.refreshTimes(manager, [receiptId]);
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
    const membership = { homeId: await this.homeOfItems(userId, ids) };
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
    const membership = { homeId: await this.homeOfItems(userId, uniqueIds) };
    const owned = await this.items.countInHome(uniqueIds, membership.homeId);
    if (owned !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const priced = uniqueIds.map((id) => ({ id, cost: normalizeCost(unique.get(id)) }));
    const updated = await this.itemRows.manager.transaction(async (manager) => {
      const changed = await this.items.markNeededBoughtMany(membership.homeId, userId, now, priced, manager);
      if (changed > 0) await this.afterBought(manager, membership.homeId, uniqueIds, now, receiptId);
      return changed;
    });
    return { updated };
  }

  async removeMany(userId: string, ids: string[]) {
    // Already gone (deleted on another phone, or this request sent twice) is
    // what was asked for: only the items still there are checked and removed.
    const present = await this.itemRows.find({
      where: { id: In([...new Set(ids)]) },
      select: { id: true, homeId: true },
    });
    if (present.length === 0) return { deleted: 0 };
    const uniqueIds = present.map((row) => row.id);
    const membership = { homeId: await this.homeOfItems(userId, uniqueIds) };
    const invoiced = await this.itemRows.find({
      where: { id: In(uniqueIds), homeId: membership.homeId, receiptId: Not(IsNull()) },
    });
    if (invoiced.length === 0) {
      await this.items.deleteInHome(uniqueIds, membership.homeId);
      return { deleted: uniqueIds.length };
    }
    // Their prices leave the invoice with them, and an invoice left empty goes too.
    await this.receipts.manager.transaction(async (manager) => {
      await manager.delete(Item, { id: In(uniqueIds), homeId: membership.homeId });
      for (const item of invoiced) {
        const cost = item.cost === null || item.cost === undefined ? 0 : Number(item.cost);
        if (cost > 0) await this.adjustReceiptTotal(manager, item.receiptId as string, -cost);
      }
      const tripIds = [...new Set(invoiced.map((item) => item.receiptId as string))];
      for (const receiptId of tripIds) {
        await this.deleteIfEmpty(manager, receiptId);
      }
      await this.trips.refreshTimes(manager, tripIds);
    });
    return { deleted: uniqueIds.length };
  }

  async setManyUrgent(userId: string, ids: string[], urgent: boolean) {
    const uniqueIds = [...new Set(ids)];
    const membership = { homeId: await this.homeOfItems(userId, uniqueIds) };
    const rows = await this.items.findNeededByIds(uniqueIds, membership.homeId);
    if (rows.length !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    const changing = rows.filter((item) => item.urgent !== urgent);
    await this.items.patchNeeded(
      changing.map((item) => item.id),
      membership.homeId,
      { urgent },
    );
    const became = urgent ? changing : [];

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

  async setManyCategory(userId: string, ids: string[], category: ItemCategory) {
    const rows = await this.neededInOneHome(userId, ids);
    await this.categories.assertUsable(rows[0].homeId, category);
    const changing = rows.filter((item) => item.category !== category);
    await this.items.patchNeeded(
      changing.map((item) => item.id),
      rows[0].homeId,
      { category },
    );
    return { updated: rows.length };
  }

  /** A blank unit clears it: the items go back to plain pieces. */
  async setManyUnit(userId: string, ids: string[], unit: string) {
    const rows = await this.neededInOneHome(userId, ids);
    const next = blankToNull(unit);
    const changing = rows.filter((item) => (item.unit ?? null) !== next);
    await this.items.patchNeeded(
      changing.map((item) => item.id),
      rows[0].homeId,
      { unit: next },
    );
    return { updated: rows.length };
  }

  /**
   * Parks items on the Later shelf. `until` is the day they return by
   * themselves; null keeps them there until someone brings them back.
   */
  async setManyLater(userId: string, ids: string[], until: Date | null) {
    const rows = await this.neededInOneHome(userId, ids);
    const now = new Date();
    if (until && (until.getTime() <= now.getTime() || until.getTime() - now.getTime() > MAX_LATER_MS)) {
      throw new DomainError(
        "INVALID_LATER_DATE",
        "Pick a day within the next year.",
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.items.setLater(
      rows.map((item) => item.id),
      rows[0].homeId,
      now,
      until,
    );
    return { updated: rows.length, laterAt: now, laterUntil: until };
  }

  /** Brings parked items back to the list now. */
  async clearManyLater(userId: string, ids: string[]) {
    const rows = await this.neededInOneHome(userId, ids);
    await this.items.setLater(
      rows.map((item) => item.id),
      rows[0].homeId,
      null,
      null,
    );
    return { updated: rows.length };
  }

  /**
   * Returns parked items whose day has come to their lists and tells the home.
   * With a homeId only that home is checked (a list being opened).
   */
  async releaseDueLater(homeId?: string) {
    const released = await this.items.releaseDueLater(homeId);
    // Queued together, so several returning items arrive as one notification.
    for (const item of released) {
      this.notifications.notifyLaterBack({
        homeId: item.homeId,
        itemName: item.name,
        listId: item.listId,
      });
    }
    return released.length;
  }

  /** The still-needed items behind these ids; every id must be one, in the caller's home. */
  private async neededInOneHome(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const homeId = await this.homeOfItems(userId, uniqueIds);
    const rows = await this.items.findNeededByIds(uniqueIds, homeId);
    if (rows.length !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    return rows;
  }

  async moveMany(userId: string, ids: string[], listId: string) {
    const uniqueIds = [...new Set(ids)];
    const membership = { homeId: await this.homeOfItems(userId, uniqueIds) };
    const list = await this.shoppingLists.findActiveById(listId, membership.homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }

    const rows = await this.items.findNeededByIds(uniqueIds, membership.homeId);
    if (rows.length !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }

    const moving = rows.filter((item) => item.listId !== list.id);
    await this.items.patchNeeded(
      moving.map((item) => item.id),
      membership.homeId,
      { listId: list.id },
    );
    let moved = 0;
    for (const item of moving) {
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

  /** `id` is made on the phone: sending the same create twice gives back the first list. */
  async createList(userId: string, homeId: string, name: string, id?: string) {
    await this.homes.requireMembership(userId, homeId);
    if (id) {
      const [existing] = await this.shoppingLists.findByIds([id]);
      if (existing) {
        if (existing.homeId !== homeId) throw idTaken();
        return { id: existing.id, homeId: existing.homeId, name: existing.name };
      }
    }
    const trimmed = name.trim();
    if (!trimmed) {
      throw new DomainError("LIST_NAME_REQUIRED", "Enter a list name.", HttpStatus.BAD_REQUEST);
    }
    const row = await this.shoppingLists.insert(homeId, trimmed, id);
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

  /** The item a phone already saved under this id, if any (never another home's). */
  private async itemWithId(id: string, homeId: string) {
    const row = await this.itemRows.findOne({ where: { id } });
    if (row && row.homeId !== homeId) throw idTaken();
    return row;
  }

  /** The item as the app sees it, after checking the user may touch it. */
  async view(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    const [view] = await this.withNames([item]);
    return view;
  }

  async requireItem(userId: string, itemId: string) {
    const homeId = await this.homeOfItems(userId, [itemId]);
    const item = await this.items.findInHome(itemId, homeId);
    if (!item) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    return item;
  }

  /** The row as it is now, after a write. Gone meanwhile reads as a missing item. */
  private async reload(item: Pick<Item, "id" | "homeId">) {
    const row = await this.items.findInHome(item.id, item.homeId);
    if (!row) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /**
   * The one home these items are in, if the user belongs to it. Taken from the
   * items, not from the user's "active" home: another of their devices may be
   * showing a different home.
   */
  private async homeOfItems(userId: string, ids: string[]) {
    const notFound = () =>
      new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    const unique = [...new Set(ids)];
    const rows = await this.itemRows.find({
      where: { id: In(unique) },
      select: { id: true, homeId: true },
    });
    const homeIds = new Set(rows.map((row) => row.homeId));
    if (rows.length !== unique.length || homeIds.size !== 1) throw notFound();
    const [homeId] = homeIds;
    // Someone else's home answers like a missing item.
    await this.homes.requireMembership(userId, homeId).catch(() => {
      throw notFound();
    });
    return homeId;
  }

  /** Rows as the app sees them (names of people, lists and invoices filled in). */
  async withNames(rows: Item[]): Promise<ItemView[]> {
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          [row.addedBy, row.boughtBy, row.notFoundBy].filter((id): id is string => Boolean(id)),
        ),
      ),
    ];
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
    const imageIds = [...new Set(rows.map((row) => row.imageId).filter((id): id is string => Boolean(id)))];
    const hashes = imageIds.length ? await this.items.findImageHashes(imageIds) : [];
    const hashById = new Map(hashes.map((image) => [image.id, image.thumbhash]));

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
      /** Place in its list; the app orders by (sortOrder, createdAt desc) like the server. */
      sortOrder: row.sortOrder,
      cost: row.cost === null || row.cost === undefined ? null : Number(row.cost),
      receiptId: row.receiptId ?? null,
      receiptTotal: receiptAmount(row.receiptId ? receiptsById.get(row.receiptId) : undefined),
      receiptName: (row.receiptId ? receiptsById.get(row.receiptId)?.name : null) ?? null,
      imageId: row.imageId ?? null,
      /** Blurred placeholder shown while the photo loads. */
      imageHash: row.imageId ? (hashById.get(row.imageId) ?? null) : null,
      addedBy: row.addedBy,
      boughtBy: row.boughtBy,
      addedByName: names.get(row.addedBy) ?? "Member",
      boughtByName: row.boughtBy ? (names.get(row.boughtBy) ?? "Member") : null,
      createdAt: row.createdAt,
      boughtAt: row.boughtAt,
      notFoundAt: row.status === "needed" ? (row.notFoundAt ?? null) : null,
      notFoundBy: row.status === "needed" ? (row.notFoundBy ?? null) : null,
      notFoundByName:
        row.status === "needed" && row.notFoundBy ? (names.get(row.notFoundBy) ?? "Member") : null,
      laterAt: row.status === "needed" ? (row.laterAt ?? null) : null,
      laterUntil: row.status === "needed" && row.laterAt ? (row.laterUntil ?? null) : null,
    }));
  }
}

/** A phone-made id that already belongs to something in another home. */
function idTaken() {
  return new DomainError("ID_TAKEN", "That id is already in use.", HttpStatus.CONFLICT);
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

type TripReceiptManager = Repository<TripReceipt>["manager"];

/** A trip the server made by itself for loose purchases: nobody priced, named or created it. */
function isAutoTrip(receipt: TripReceipt) {
  return receipt.createdBy === null && receipt.name === null && (receipt.total === null || receipt.total === undefined);
}

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
