import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { isUniqueViolation } from "../../../common/db-errors";
import { DomainError } from "../../../common/domain.error";
import { HomesService } from "../../homes/services/homes.service";
import { ITEM_CATEGORIES } from "../entities/item.entity";
import {
  CATEGORIES_REPOSITORY,
  type ICategoriesRepository,
} from "../repo/categories-repo/categories.repository";
import { ITEMS_REPOSITORY, type IItemsRepository } from "../repo/items-repo/items.repository";
import { PINS_REPOSITORY, type IPinsRepository } from "../repo/pins-repo/pins.repository";

const FALLBACK_CATEGORY = "other";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CategoryView = {
  id: string;
  name: string | null;
  builtin: boolean;
};

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: ICategoriesRepository,
    @Inject(ITEMS_REPOSITORY) private readonly items: IItemsRepository,
    @Inject(PINS_REPOSITORY) private readonly pins: IPinsRepository,
    private readonly homes: HomesService,
  ) {}

  async list(userId: string, homeId: string): Promise<CategoryView[]> {
    await this.homes.requireMembership(userId, homeId);
    const [hiddenRows, customRows] = await Promise.all([
      this.categories.findHidden(homeId),
      this.categories.findCustom(homeId),
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

  /** `id` is made on the phone: sending the same create twice gives back the first category. */
  async create(userId: string, homeId: string, name: string, id?: string) {
    await this.homes.requireMembership(userId, homeId);
    const already = id ? await this.categories.findCustomInHome(id, homeId) : null;
    if (already) return { id: already.id, name: already.name, builtin: false };
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      throw new DomainError("CATEGORY_NAME_REQUIRED", "Enter a category name.", HttpStatus.BAD_REQUEST);
    }
    const existing = await this.categories.findCustomByName(homeId, trimmed);
    if (existing) {
      throw new DomainError("CATEGORY_EXISTS", "That category already exists.", HttpStatus.CONFLICT);
    }
    try {
      const saved = await this.categories.insert(homeId, trimmed, id);
      return { id: saved.id, name: saved.name, builtin: false };
    } catch (error) {
      // Two phones adding the same name at once: the second one loses politely.
      if (isUniqueViolation(error)) {
        throw new DomainError("CATEGORY_EXISTS", "That category already exists.", HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async remove(userId: string, homeId: string, categoryId: string) {
    await this.homes.requireMembership(userId, homeId);
    if (categoryId === FALLBACK_CATEGORY) {
      throw new DomainError("CATEGORY_OTHER", "Other can't be removed.", HttpStatus.BAD_REQUEST);
    }

    const builtin = (ITEM_CATEGORIES as readonly string[]).includes(categoryId);
    if (builtin) {
      await this.categories.hide(homeId, categoryId);
    } else {
      const row = UUID_RE.test(categoryId)
        ? await this.categories.findCustomInHome(categoryId, homeId)
        : null;
      if (!row) {
        throw new DomainError("CATEGORY_NOT_FOUND", "That category was not found.", HttpStatus.NOT_FOUND);
      }
      await this.categories.deleteCustom(categoryId, homeId);
    }

    await this.items.reassignCategory(homeId, categoryId, FALLBACK_CATEGORY);
    await this.pins.reassignCategory(homeId, categoryId, FALLBACK_CATEGORY);
  }

  async assertUsable(homeId: string, categoryId: string) {
    if ((ITEM_CATEGORIES as readonly string[]).includes(categoryId)) {
      const hidden = await this.categories.findHiddenOne(homeId, categoryId);
      if (!hidden) return;
    } else if (UUID_RE.test(categoryId)) {
      const custom = await this.categories.findCustomInHome(categoryId, homeId);
      if (custom) return;
    }
    throw new DomainError("CATEGORY_NOT_FOUND", "That category was not found.", HttpStatus.BAD_REQUEST);
  }

  /**
   * A category the home can use right now: the wanted one when it still
   * exists, else "Other", else the home's first category. For items that are
   * created from a remembered category (a set, a typed name).
   */
  async usableOr(homeId: string, wanted: string | null | undefined): Promise<string> {
    return (await this.usableResolver(homeId))(wanted);
  }

  /** The same answer for many categories from one look at the home's categories. */
  async usableResolver(homeId: string): Promise<(wanted: string | null | undefined) => string> {
    const [hiddenRows, customRows] = await Promise.all([
      this.categories.findHidden(homeId),
      this.categories.findCustom(homeId),
    ]);
    const hidden = new Set(hiddenRows.map((row) => row.categoryId));
    const usable = [
      ...ITEM_CATEGORIES.filter((id) => !hidden.has(id)),
      ...customRows.map((row) => row.id),
    ];
    const known = new Set<string>(usable);
    const fallback = known.has(FALLBACK_CATEGORY) ? FALLBACK_CATEGORY : (usable[0] ?? FALLBACK_CATEGORY);
    return (wanted) => (wanted && known.has(wanted) ? wanted : fallback);
  }
}
