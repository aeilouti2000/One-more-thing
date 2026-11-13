import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../common/domain.error";
import { HomesService } from "../../homes/services/homes.service";
import { NotificationsService } from "../../notifications/services/notifications.service";
import type { ItemCategory } from "../entities/item.entity";
import { PIN_LIMIT, type Pin, type PinInterval } from "../entities/pin.entity";
import {
  ITEMS_REPOSITORY,
  type IItemsRepository,
} from "../repo/items-repo/items.repository";
import {
  LISTS_REPOSITORY,
  type IListsRepository,
} from "../repo/lists-repo/lists.repository";
import {
  PINS_REPOSITORY,
  type IPinsRepository,
} from "../repo/pins-repo/pins.repository";
import { nextPinDue } from "../utils/shopping";
import { CategoriesService } from "./categories.service";

export type PinView = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
  urgent: boolean;
  intervalDays: PinInterval;
  /** Monthly pins: day of the month it returns on (null: every 30 days). */
  monthDay: number | null;
  nextDueAt: Date;
  /** The list it repeats onto (null: the home's first list). */
  listId: string | null;
};

@Injectable()
export class PinsService {
  constructor(
    @Inject(PINS_REPOSITORY) private readonly pins: IPinsRepository,
    @Inject(ITEMS_REPOSITORY) private readonly items: IItemsRepository,
    @Inject(LISTS_REPOSITORY) private readonly lists: IListsRepository,
    private readonly homes: HomesService,
    private readonly categories: CategoriesService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    const rows = await this.pins.findByHome(homeId);
    return rows.map(toView);
  }

  async add(
    userId: string,
    homeId: string,
    input: {
      name: string;
      quantity: number;
      category: ItemCategory;
      unit?: string;
      urgent?: boolean;
      intervalDays: PinInterval;
      monthDay?: number;
      utcOffsetMin?: number;
      listId?: string;
    },
    createItem: (notify: boolean) => Promise<unknown>,
  ) {
    await this.homes.requireMembership(userId, homeId);
    await this.categories.assertUsable(homeId, input.category);
    const list = await this.resolveList(homeId, input.listId);
    await this.assertRoom(homeId, list.id);

    const now = new Date();
    const schedule = {
      intervalDays: input.intervalDays,
      monthDay: input.intervalDays === 30 ? (input.monthDay ?? null) : null,
      utcOffsetMin: input.utcOffsetMin ?? 0,
    };
    const pin = await this.pins.insert({
      homeId,
      listId: list.id,
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
      unit: blankToNull(input.unit),
      urgent: input.urgent === true,
      ...schedule,
      nextDueAt: nextPinDue(schedule, now, now),
      createdBy: userId,
    });
    await createItem(true);
    return toView(pin);
  }

  async update(
    userId: string,
    pinId: string,
    input: {
      name: string;
      category: ItemCategory;
      urgent: boolean;
      intervalDays: PinInterval;
      monthDay?: number | null;
      utcOffsetMin?: number;
      quantity?: number;
      unit?: string;
      listId?: string;
    },
  ) {
    const membership = await this.homes.requireMembership(userId);
    const pin = await this.pins.findInHome(pinId, membership.homeId);
    if (!pin) {
      throw new DomainError(
        "PIN_NOT_FOUND",
        "Pinned item not found",
        HttpStatus.NOT_FOUND,
      );
    }
    await this.categories.assertUsable(membership.homeId, input.category);
    if (input.listId && input.listId !== pin.listId) {
      const list = await this.resolveList(membership.homeId, input.listId);
      await this.assertRoom(membership.homeId, list.id, pin.id);
      pin.listId = list.id;
    }
    pin.name = input.name.trim();
    pin.category = input.category;
    pin.urgent = input.urgent;
    if (typeof input.quantity === "number") pin.quantity = input.quantity;
    if (input.unit !== undefined) pin.unit = blankToNull(input.unit);
    // monthDay omitted keeps the current day; only monthly pins keep one.
    const monthDay =
      input.intervalDays !== 30
        ? null
        : input.monthDay === undefined
          ? pin.monthDay
          : input.monthDay;
    if (pin.intervalDays !== input.intervalDays || pin.monthDay !== monthDay) {
      const now = new Date();
      pin.intervalDays = input.intervalDays;
      pin.monthDay = monthDay;
      if (input.utcOffsetMin !== undefined) pin.utcOffsetMin = input.utcOffsetMin;
      pin.nextDueAt = nextPinDue(pin, now, now);
    }
    return toView(await this.pins.save(pin));
  }

  async remove(userId: string, pinId: string) {
    const membership = await this.homes.requireMembership(userId);
    const pin = await this.pins.findInHome(pinId, membership.homeId);
    if (!pin) {
      throw new DomainError(
        "PIN_NOT_FOUND",
        "Pinned item not found",
        HttpStatus.NOT_FOUND,
      );
    }
    await this.pins.deleteById(pin.id);
    return { deleted: true };
  }

  /** A deleted list's pins move to the home's first remaining list. */
  async moveOffList(homeId: string, deletedListId: string) {
    const fallback = await this.lists.findFirstActive(homeId);
    await this.pins.moveList(homeId, deletedListId, fallback?.id ?? null);
  }

  private async resolveList(homeId: string, listId?: string) {
    const list = listId
      ? await this.lists.findActiveById(listId, homeId)
      : await this.lists.findFirstActive(homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    return list;
  }

  private async assertRoom(homeId: string, listId: string, exceptPinId?: string) {
    const count = await this.pins.countOnList(homeId, listId, exceptPinId);
    if (count >= PIN_LIMIT) {
      throw new DomainError(
        "PIN_LIMIT",
        `You can pin up to ${PIN_LIMIT} items per list.`,
        HttpStatus.CONFLICT,
      );
    }
  }

  async materializeDueHomes() {
    const homeIds = await this.pins.findDueHomeIds();
    for (const homeId of homeIds) {
      await this.materializeDue(homeId);
    }
  }

  async materializeDue(homeId: string) {
    const due = await this.pins.findDue(homeId);
    if (due.length === 0) return;

    const fallback = await this.lists.findFirstActive(homeId);
    if (!fallback) return;
    const activeLists = new Map<string, boolean>();
    const targetList = async (listId: string | null) => {
      if (!listId || listId === fallback.id) return fallback.id;
      if (!activeLists.has(listId)) {
        activeLists.set(listId, Boolean(await this.lists.findActiveById(listId, homeId)));
      }
      return activeLists.get(listId) ? listId : fallback.id;
    };

    // "Already on the list" is checked per list: the same name on another
    // list doesn't stop a pin from arriving on its own list.
    const needed = await this.items.findNeeded(homeId);
    const onList = new Set(
      needed.map((item) => `${item.listId}:${item.name.trim().toLowerCase()}`),
    );
    const now = new Date();
    const arrived: { name: string; listId: string }[] = [];

    for (const pin of due) {
      // Once-pins are templates only; they must not auto-return.
      if (pin.intervalDays <= 0) continue;

      const claimed = await this.pins.claimDue(
        pin.id,
        nextPinDue(pin, pin.nextDueAt, now),
      );
      if (!claimed) continue;

      const listId = await targetList(pin.listId);
      const key = `${listId}:${pin.name.trim().toLowerCase()}`;
      if (onList.has(key)) continue;

      const created = await this.items.insert({
        homeId,
        listId,
        name: pin.name,
        quantity: pin.quantity,
        unit: pin.unit,
        category: pin.category,
        notes: null,
        status: "needed",
        urgent: pin.urgent,
        urgentBeforeBought: false,
        addedBy: pin.createdBy,
        boughtBy: null,
        boughtAt: null,
      });
      await this.items.placeNeeded(
        homeId,
        created.id,
        pin.urgent ? "top" : "after-urgent",
        created.listId,
      );
      onList.add(key);
      arrived.push({ name: pin.name, listId });
    }

    // Queued together, so several due pins arrive as one notification.
    for (const pin of arrived) {
      this.notifications.notifyPinDue({ homeId, itemName: pin.name, listId: pin.listId });
    }
  }
}

function toView(pin: Pin): PinView {
  return {
    id: pin.id,
    name: pin.name,
    quantity: Number(pin.quantity),
    unit: pin.unit,
    category: pin.category,
    urgent: pin.urgent,
    intervalDays: pin.intervalDays,
    monthDay: pin.monthDay ?? null,
    nextDueAt: pin.nextDueAt,
    listId: pin.listId ?? null,
  };
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
