import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { DomainError } from "../../common/domain.error";
import { HomesService } from "../homes/homes.service";
import { NotificationsService } from "../notifications/notifications.service";
import { User } from "../../users/user.entity";
import type { ItemCategory } from "./item.entity";
import { Item } from "./item.entity";
import { undoDeadline } from "./shopping";
import { StaplesService } from "./staples.service";

export type ItemView = {
  id: string;
  homeId: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
  notes: string | null;
  status: "needed" | "bought";
  urgent: boolean;
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
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly homes: HomesService,
    private readonly notifications: NotificationsService,
    private readonly staples: StaplesService,
  ) {}

  async list(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    await this.staples.materializeDue(homeId, userId);
    const rows = await this.items.find({
      where: { homeId },
      order: { createdAt: "DESC" },
    });
    return this.withNames(rows);
  }

  async add(
    userId: string,
    homeId: string,
    input: { name: string; quantity: number; category: ItemCategory; unit?: string; notes?: string; urgent?: boolean },
    options?: { notify?: boolean },
  ) {
    await this.homes.requireMembership(userId, homeId);
    const item = await this.items.save(
      this.items.create({
        homeId,
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
    const becameUrgent = !item.urgent && input.urgent && item.status === "needed";
    item.name = input.name.trim();
    item.quantity = input.quantity;
    item.category = input.category;
    item.urgent = input.urgent;
    item.notes = blankToNull(input.notes);
    const saved = await this.items.save(item);
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

  async markBought(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    item.urgentBeforeBought = item.urgent;
    item.status = "bought";
    item.urgent = false;
    item.boughtBy = userId;
    item.boughtAt = new Date();
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
    item.status = "needed";
    item.urgent = item.urgentBeforeBought;
    item.urgentBeforeBought = false;
    item.boughtBy = null;
    item.boughtAt = null;
    const saved = await this.items.save(item);
    const [view] = await this.withNames([saved]);
    return view;
  }

  async markManyBought(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const membership = await this.homes.requireMembership(userId);
    const owned = await this.items.count({ where: { id: In(uniqueIds), homeId: membership.homeId } });
    if (owned !== uniqueIds.length) {
      throw new DomainError("ITEM_NOT_FOUND", "Item not found", HttpStatus.NOT_FOUND);
    }
    const result = await this.items
      .createQueryBuilder()
      .update(Item)
      .set({
        status: "bought",
        urgentBeforeBought: () => "urgent",
        urgent: false,
        boughtBy: userId,
        boughtAt: new Date(),
      })
      .where("id IN (:...uniqueIds)", { uniqueIds })
      .andWhere("home_id = :homeId", { homeId: membership.homeId })
      .andWhere("status = :status", { status: "needed" })
      .execute();
    return { updated: result.affected ?? 0 };
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

    return rows.map((row) => ({
      id: row.id,
      homeId: row.homeId,
      name: row.name,
      quantity: Number(row.quantity),
      unit: row.unit,
      category: row.category,
      notes: row.notes,
      status: row.status,
      urgent: row.urgent,
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
