import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DomainError } from "../../common/domain.error";
import { HomesService } from "../homes/homes.service";
import { CustomCategory } from "./custom-category.entity";
import { HiddenCategory } from "./hidden-category.entity";
import { ITEM_CATEGORIES } from "./item.entity";
import { Item } from "./item.entity";
import { Staple } from "./staple.entity";

const FALLBACK_CATEGORY = "other";

export type CategoryView = {
  id: string;
  name: string | null;
  builtin: boolean;
};

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CustomCategory) private readonly custom: Repository<CustomCategory>,
    @InjectRepository(HiddenCategory) private readonly hidden: Repository<HiddenCategory>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Staple) private readonly staples: Repository<Staple>,
    private readonly homes: HomesService,
  ) {}

  async list(userId: string, homeId: string): Promise<CategoryView[]> {
    await this.homes.requireMembership(userId, homeId);
    const [hiddenRows, customRows] = await Promise.all([
      this.hidden.find({ where: { homeId } }),
      this.custom.find({ where: { homeId }, order: { createdAt: "ASC" } }),
    ]);
    const hiddenIds = new Set(hiddenRows.map((row) => row.categoryId));
    return [
      ...ITEM_CATEGORIES.filter((id) => !hiddenIds.has(id)).map((id) => ({
        id,
        name: null,
        builtin: true,
      })),
      ...customRows.map((row) => ({ id: row.id, name: row.name, builtin: false })),
    ];
  }

  async create(userId: string, homeId: string, name: string) {
    await this.homes.requireMembership(userId, homeId);
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      throw new DomainError("CATEGORY_NAME_REQUIRED", "Enter a category name.", HttpStatus.BAD_REQUEST);
    }
    const existing = await this.custom
      .createQueryBuilder("category")
      .where("category.home_id = :homeId", { homeId })
      .andWhere("lower(category.name) = lower(:name)", { name: trimmed })
      .getOne();
    if (existing) {
      throw new DomainError("CATEGORY_EXISTS", "That category already exists.", HttpStatus.CONFLICT);
    }
    const saved = await this.custom.save(this.custom.create({ homeId, name: trimmed }));
    return { id: saved.id, name: saved.name, builtin: false };
  }

  async remove(userId: string, homeId: string, categoryId: string) {
    await this.homes.requireMembership(userId, homeId);
    if (categoryId === FALLBACK_CATEGORY) {
      throw new DomainError("CATEGORY_OTHER", "Other can't be removed.", HttpStatus.BAD_REQUEST);
    }

    const builtin = (ITEM_CATEGORIES as readonly string[]).includes(categoryId);
    if (builtin) {
      await this.hidden.save(this.hidden.create({ homeId, categoryId }));
    } else {
      const row = await this.custom.findOne({ where: { id: categoryId, homeId } });
      if (!row) {
        throw new DomainError("CATEGORY_NOT_FOUND", "That category was not found.", HttpStatus.NOT_FOUND);
      }
      await this.custom.delete({ id: categoryId, homeId });
    }

    await this.items.update({ homeId, category: categoryId }, { category: FALLBACK_CATEGORY });
    await this.staples.update({ homeId, category: categoryId }, { category: FALLBACK_CATEGORY });
  }

  async assertUsable(homeId: string, categoryId: string) {
    if ((ITEM_CATEGORIES as readonly string[]).includes(categoryId)) {
      const hidden = await this.hidden.findOne({ where: { homeId, categoryId } });
      if (!hidden) return;
    } else {
      const custom = await this.custom.findOne({ where: { id: categoryId, homeId } });
      if (custom) return;
    }
    throw new DomainError("CATEGORY_NOT_FOUND", "That category was not found.", HttpStatus.BAD_REQUEST);
  }
}
