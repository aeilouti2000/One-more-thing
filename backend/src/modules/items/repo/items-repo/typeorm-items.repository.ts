import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "../../../../users/user.entity";
import { Item } from "../../entities/item.entity";
import { applyNeededOrder, placeNeededItem, placeNeededItems } from "../../utils/item-order";
import { IItemsRepository, type ItemPatch, type NewItemInput } from "./items.repository";

@Injectable()
export class TypeormItemsRepository implements IItemsRepository {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByHome(homeId: string) {
    return this.items.find({
      where: { homeId },
      order: { sortOrder: "ASC", createdAt: "DESC" },
    });
  }

  async insert(input: NewItemInput) {
    return this.items.save(this.items.create(input));
  }

  async patch(id: string, homeId: string, changes: ItemPatch) {
    if (Object.keys(changes).length === 0) return 0;
    const result = await this.items.update({ id, homeId }, changes);
    return result.affected ?? 0;
  }

  async patchNeeded(ids: string[], homeId: string, changes: ItemPatch) {
    if (ids.length === 0 || Object.keys(changes).length === 0) return 0;
    const result = await this.items.update({ id: In(ids), homeId, status: "needed" }, changes);
    return result.affected ?? 0;
  }

  findInHome(itemId: string, homeId: string) {
    return this.items.findOne({ where: { id: itemId, homeId } });
  }

  countInHome(ids: string[], homeId: string) {
    return this.items.count({ where: { id: In(ids), homeId } });
  }

  async markNeededBought(
    id: string,
    homeId: string,
    userId: string,
    boughtAt: Date,
    cost: number | null,
  ) {
    const result = await this.items
      .createQueryBuilder()
      .update(Item)
      .set({
        status: "bought",
        urgentBeforeBought: () => "urgent",
        urgent: false,
        boughtBy: userId,
        boughtAt,
        cost,
        notFoundAt: null,
        notFoundBy: null,
        laterAt: null,
        laterUntil: null,
      })
      .where("id = :id", { id })
      .andWhere("home_id = :homeId", { homeId })
      .andWhere("status = :status", { status: "needed" })
      .execute();
    return result.affected ?? 0;
  }

  async setLater(ids: string[], homeId: string, at: Date | null, until: Date | null) {
    if (ids.length === 0) return 0;
    const result = await this.items.update(
      { id: In(ids), homeId, status: "needed" },
      { laterAt: at, laterUntil: at ? until : null },
    );
    return result.affected ?? 0;
  }

  async releaseDueLater(homeId?: string) {
    const result: unknown = await this.items.query(
      `UPDATE items
          SET later_at = NULL, later_until = NULL
        WHERE later_until IS NOT NULL
          AND later_until <= now()
          AND status = 'needed'
          ${homeId ? "AND home_id = $1::uuid" : ""}
        RETURNING id, home_id AS "homeId", list_id AS "listId", name`,
      homeId ? [homeId] : [],
    );
    // node-postgres answers UPDATE … RETURNING as [rows, count].
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    return (Array.isArray(rows) ? rows : []) as {
      id: string;
      homeId: string;
      listId: string;
      name: string;
    }[];
  }

  async insertMany(inputs: NewItemInput[]) {
    if (inputs.length === 0) return [];
    const rows = inputs.map((input) => this.items.create(input));
    // Saved together in one transaction; save() fills in ids and dates.
    return this.items.save(rows);
  }

  placeNeededMany(homeId: string, itemIds: string[], listId: string) {
    return placeNeededItems(this.items, homeId, itemIds, listId);
  }

  findLatestByName(homeId: string, name: string) {
    return this.items
      .createQueryBuilder("item")
      .where("item.home_id = :homeId", { homeId })
      .andWhere("lower(item.name) = lower(:name)", { name: name.trim() })
      .orderBy("item.created_at", "DESC")
      .limit(1)
      .getOne();
  }

  async countAddedSince(homeId: string, listId: string, since: Date) {
    const rows = await this.items
      .createQueryBuilder("item")
      .select("item.added_by", "userId")
      .addSelect("count(*)", "count")
      // The home narrows it to that home's rows; (list_id, created_at) is indexed.
      .where("item.home_id = :homeId", { homeId })
      .andWhere("item.list_id = :listId", { listId })
      .andWhere("item.created_at >= :since", { since })
      .groupBy("item.added_by")
      .getRawMany<{ userId: string; count: string }>();
    return rows.map((row) => ({ userId: row.userId, count: Number(row.count) }));
  }

  async setNotFound(id: string, homeId: string, userId: string | null, at: Date | null) {
    const result = await this.items
      .createQueryBuilder()
      .update(Item)
      .set({ notFoundAt: at, notFoundBy: userId })
      .where("id = :id", { id })
      .andWhere("home_id = :homeId", { homeId })
      .andWhere("status = :status", { status: "needed" })
      .execute();
    return result.affected ?? 0;
  }

  async markNeededBoughtMany(
    homeId: string,
    userId: string,
    boughtAt: Date,
    entries: { id: string; cost: number | null }[],
  ) {
    if (entries.length === 0) return 0;
    const cases = entries
      .map((entry, index) => {
        const cost = entry.cost === null ? "NULL" : String(entry.cost);
        return `WHEN $${index + 1}::uuid THEN ${cost}`;
      })
      .join(" ");
    const inList = entries.map((_, index) => `$${index + 1}::uuid`).join(", ");
    const userParam = entries.length + 1;
    const timeParam = entries.length + 2;
    const homeParam = entries.length + 3;
    const result: unknown = await this.items.query(
      `UPDATE items
       SET status = 'bought',
           urgent_before_bought = urgent,
           urgent = false,
           bought_by = $${userParam}::uuid,
           bought_at = $${timeParam},
           cost = CASE id ${cases} ELSE cost END,
           not_found_at = NULL,
           not_found_by = NULL,
           later_at = NULL,
           later_until = NULL
       WHERE home_id = $${homeParam}::uuid
         AND status = 'needed'
         AND id IN (${inList})`,
      [...entries.map((entry) => entry.id), userId, boughtAt, homeId],
    );
    if (Array.isArray(result)) return Number(result[1] ?? 0);
    return Number((result as { rowCount?: number }).rowCount ?? 0);
  }

  async deleteInHome(ids: string[], homeId: string) {
    await this.items.delete({ id: In(ids), homeId });
  }

  findNeededByIds(ids: string[], homeId: string) {
    return this.items.find({
      where: { id: In(ids), homeId, status: "needed" },
    });
  }

  async deleteNeededOnList(homeId: string, listId: string) {
    await this.items.delete({ homeId, listId, status: "needed" });
  }

  findNeeded(homeId: string) {
    return this.items.find({ where: { homeId, status: "needed" } });
  }

  placeNeeded(
    homeId: string,
    itemId: string,
    slot: "top" | "after-urgent",
    listId?: string,
  ) {
    return placeNeededItem(this.items, homeId, itemId, slot, listId);
  }

  applyNeededOrder(homeId: string, ids: string[]) {
    return applyNeededOrder(this.items, homeId, ids);
  }

  async reassignCategory(homeId: string, categoryId: string, fallback: string) {
    await this.items.update({ homeId, category: categoryId }, { category: fallback });
  }

  findUserNames(ids: string[]) {
    return this.users.find({ where: { id: In(ids) }, select: { id: true, name: true } });
  }

  async findUserName(userId: string) {
    const actor = await this.users.findOne({
      where: { id: userId },
      select: { id: true, name: true },
    });
    return actor?.name ?? null;
  }
}
