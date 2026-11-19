import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DomainError } from "../../../common/domain.error";
import { HomesService } from "../../homes/services/homes.service";
import { NotificationsService } from "../../notifications/services/notifications.service";
import {
  ItemSet,
  SET_ITEM_LIMIT,
  SET_LIMIT,
  type SetItem,
} from "../entities/item-set.entity";
import { ITEMS_REPOSITORY, type IItemsRepository } from "../repo/items-repo/items.repository";
import { LISTS_REPOSITORY, type IListsRepository } from "../repo/lists-repo/lists.repository";
import { CategoriesService } from "./categories.service";
import { ItemsService, type ItemView } from "./items.service";

export type SetView = {
  id: string;
  name: string;
  items: SetItem[];
  createdAt: Date;
};

type SetItemInput = { name: string; quantity: number; unit?: string | null; category: string };

/** Saved groups of items ("Friday BBQ") a home adds to a list in one tap. */
@Injectable()
export class SetsService {
  constructor(
    @InjectRepository(ItemSet) private readonly sets: Repository<ItemSet>,
    @Inject(ITEMS_REPOSITORY) private readonly itemsRepo: IItemsRepository,
    @Inject(LISTS_REPOSITORY) private readonly lists: IListsRepository,
    private readonly homes: HomesService,
    private readonly items: ItemsService,
    private readonly categories: CategoriesService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, homeId: string): Promise<SetView[]> {
    await this.homes.requireMembership(userId, homeId);
    const rows = await this.sets.find({ where: { homeId }, order: { createdAt: "ASC" } });
    return rows.map(toView);
  }

  async create(userId: string, homeId: string, input: { name: string; items: SetItemInput[] }) {
    await this.homes.requireMembership(userId, homeId);
    const count = await this.sets.count({ where: { homeId } });
    if (count >= SET_LIMIT) {
      throw new DomainError(
        "SET_LIMIT",
        `You can save up to ${SET_LIMIT} sets.`,
        HttpStatus.CONFLICT,
      );
    }
    const saved = await this.sets.save(
      this.sets.create({
        homeId,
        name: cleanName(input.name),
        items: cleanItems(input.items),
        createdBy: userId,
      }),
    );
    return toView(saved);
  }

  async update(
    userId: string,
    setId: string,
    input: { name?: string | null; items?: SetItemInput[] | null },
  ) {
    const set = await this.requireSet(userId, setId);
    // null reads as "not sent", the same as leaving the field out.
    if (input.name != null) set.name = cleanName(input.name);
    if (input.items != null) set.items = cleanItems(input.items);
    return toView(await this.sets.save(set));
  }

  async remove(userId: string, setId: string) {
    const set = await this.requireSet(userId, setId);
    await this.sets.delete({ id: set.id });
    return { deleted: true };
  }

  /**
   * Puts the set's items on a list. What is already needed there is skipped,
   * and a match waiting on the Later shelf comes back instead of being doubled.
   */
  async addToList(
    userId: string,
    setId: string,
    listId?: string,
  ): Promise<{ added: ItemView[]; restored: string[]; skipped: number; listId: string }> {
    const set = await this.requireSet(userId, setId);
    const list = listId
      ? await this.lists.findActiveById(listId, set.homeId)
      : await this.lists.findFirstActive(set.homeId);
    if (!list) throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);

    // One "add" per list at a time: a double tap, or two phones, must not put
    // the set on the list twice. The lock is held until this block ends.
    const { created, restoreIds, skipped } = await this.sets.manager.transaction(async (manager) => {
      await manager.query("select pg_advisory_xact_lock(hashtext($1))", [`set-add:${list.id}`]);
      const needed = (await this.itemsRepo.findNeeded(set.homeId)).filter(
        (item) => item.listId === list.id,
      );
      const onList = new Map(needed.map((item) => [nameKey(item.name), item]));
      const fresh: SetItem[] = [];
      const restoreIds: string[] = [];
      let skipped = 0;
      const seen = new Set<string>();
      for (const item of set.items) {
        const key = nameKey(item.name);
        if (seen.has(key)) continue;
        seen.add(key);
        const existing = onList.get(key);
        if (!existing) fresh.push(item);
        else if (existing.laterAt) restoreIds.push(existing.id);
        else skipped += 1;
      }

      if (restoreIds.length > 0) await this.itemsRepo.setLater(restoreIds, set.homeId, null, null);

      // A category deleted since the set was saved falls back to "Other".
      const usable = await this.categories.usableResolver(set.homeId);

      const rows = await this.itemsRepo.insertMany(
        fresh.map((item) => ({
          homeId: set.homeId,
          listId: list.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: usable(item.category),
          notes: null,
          status: "needed" as const,
          urgent: false,
          addedBy: userId,
          boughtBy: null,
          boughtAt: null,
        })),
      );
      await this.itemsRepo.placeNeededMany(
        set.homeId,
        rows.map((item) => item.id),
        list.id,
      );
      return { created: rows, restoreIds, skipped };
    });

    const added = await this.items.withNames(created);
    // Queued per person, so the whole set arrives as one notification.
    for (const item of added) {
      this.notifications.notifyItemAdded({
        homeId: set.homeId,
        actorId: userId,
        actorName: item.addedByName,
        itemName: item.name,
        urgent: false,
        listId: list.id,
      });
    }
    return { added, restored: restoreIds, skipped, listId: list.id };
  }

  private async requireSet(userId: string, setId: string) {
    const notFound = () => new DomainError("SET_NOT_FOUND", "Set not found", HttpStatus.NOT_FOUND);
    const set = await this.sets.findOne({ where: { id: setId } });
    if (!set) throw notFound();
    // Someone else's home answers like a missing set.
    await this.homes.requireMembership(userId, set.homeId).catch(() => {
      throw notFound();
    });
    return set;
  }
}

function toView(set: ItemSet): SetView {
  return { id: set.id, name: set.name, items: set.items ?? [], createdAt: set.createdAt };
}

function nameKey(name: string) {
  return name.trim().toLowerCase();
}

function cleanName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new DomainError("SET_NAME_REQUIRED", "Enter a name for the set.", HttpStatus.BAD_REQUEST);
  }
  return trimmed;
}

/** Trims, drops blanks and repeated names, and enforces the size limit. */
export function cleanItems(items: SetItemInput[]): SetItem[] {
  const seen = new Set<string>();
  const cleaned: SetItem[] = [];
  for (const item of items) {
    const name = item.name.trim();
    const key = nameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const unit = item.unit?.trim() ?? "";
    cleaned.push({
      name,
      quantity: item.quantity,
      unit: unit ? unit : null,
      category: item.category,
    });
  }
  if (cleaned.length === 0) {
    throw new DomainError("SET_EMPTY", "A set needs at least one item.", HttpStatus.BAD_REQUEST);
  }
  if (cleaned.length > SET_ITEM_LIMIT) {
    throw new DomainError(
      "SET_TOO_BIG",
      `A set can hold up to ${SET_ITEM_LIMIT} items.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return cleaned;
}
