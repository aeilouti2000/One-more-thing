import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { Item } from "../../entities/item.entity";
import { ShoppingList } from "../../entities/shopping-list.entity";
import { IListsRepository, type HistoryListRow } from "./lists.repository";

@Injectable()
export class TypeormListsRepository implements IListsRepository {
  constructor(
    @InjectRepository(ShoppingList) private readonly lists: Repository<ShoppingList>,
  ) {}

  findActive(homeId: string) {
    return this.lists.find({
      where: { homeId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
  }

  findActiveById(listId: string, homeId: string) {
    return this.lists.findOne({
      where: { id: listId, homeId, deletedAt: IsNull() },
    });
  }

  findFirstActive(homeId: string) {
    return this.lists.findOne({
      where: { homeId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
  }

  findByIds(ids: string[]) {
    return this.lists.find({ where: { id: In(ids) } });
  }

  historyWithBoughtItems(homeId: string) {
    return this.lists
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
      .getRawMany<HistoryListRow>();
  }

  insert(homeId: string, name: string) {
    return this.lists.save(this.lists.create({ homeId, name, deletedAt: null }));
  }

  save(list: ShoppingList) {
    return this.lists.save(list);
  }

  countActive(homeId: string) {
    return this.lists.count({
      where: { homeId, deletedAt: IsNull() },
    });
  }
}
