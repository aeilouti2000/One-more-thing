import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { User } from "../../../../users/user.entity";
import { Item } from "../../entities/item.entity";
import { applyNeededOrder, placeNeededItem } from "../../utils/item-order";
import { IItemsRepository, type NewItemInput } from "./items.repository";

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

  save(item: Item) {
    return this.items.save(item);
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
      })
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
           cost = CASE id ${cases} ELSE cost END
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
