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
import { advanceDue } from "../utils/shopping";
import { CategoriesService } from "./categories.service";

export type PinView = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
  urgent: boolean;
  intervalDays: PinInterval;
  nextDueAt: Date;
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
    },
    createItem: (notify: boolean) => Promise<unknown>,
  ) {
    await this.homes.requireMembership(userId, homeId);
    await this.categories.assertUsable(homeId, input.category);
    const count = await this.pins.count(homeId);
    if (count >= PIN_LIMIT) {
      throw new DomainError(
        "PIN_LIMIT",
        "You can pin up to 12 items.",
        HttpStatus.CONFLICT,
      );
    }

    const now = new Date();
    const pin = await this.pins.insert({
      homeId,
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
      unit: blankToNull(input.unit),
      urgent: input.urgent === true,
      intervalDays: input.intervalDays,
      nextDueAt: advanceDue(now, input.intervalDays, now),
      createdBy: userId,
    });
    await createItem(true);
    return toView(pin);
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

  async materializeDueHomes() {
    const homeIds = await this.pins.findDueHomeIds();
    for (const homeId of homeIds) {
      await this.materializeDue(homeId);
    }
  }

  async materializeDue(homeId: string) {
    const due = await this.pins.findDue(homeId);
    if (due.length === 0) return;

    const needed = await this.items.findNeeded(homeId);
    const names = new Set(needed.map((item) => item.name.trim().toLowerCase()));
    const now = new Date();
    const arrived: string[] = [];

    for (const pin of due) {
      const claimed = await this.pins.claimDue(
        pin.id,
        advanceDue(pin.nextDueAt, pin.intervalDays, now),
      );
      if (!claimed) continue;

      const key = pin.name.trim().toLowerCase();
      if (names.has(key)) continue;

      const list = await this.lists.findFirstActive(homeId);
      if (!list) continue;
      const created = await this.items.insert({
        homeId,
        listId: list.id,
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
      names.add(key);
      arrived.push(pin.name);
    }

    for (const itemName of arrived) {
      await this.notifications.notifyPinDue({ homeId, itemName });
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
    nextDueAt: pin.nextDueAt,
  };
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
