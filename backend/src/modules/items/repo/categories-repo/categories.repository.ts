import type { CustomCategory } from "../../entities/custom-category.entity";
import type { HiddenCategory } from "../../entities/hidden-category.entity";

export interface ICategoriesRepository {
  findHidden(homeId: string): Promise<HiddenCategory[]>;
  findCustom(homeId: string): Promise<CustomCategory[]>;
  findCustomByName(homeId: string, name: string): Promise<CustomCategory | null>;
  insert(homeId: string, name: string): Promise<CustomCategory>;
  findCustomInHome(categoryId: string, homeId: string): Promise<CustomCategory | null>;
  hide(homeId: string, categoryId: string): Promise<void>;
  deleteCustom(categoryId: string, homeId: string): Promise<void>;
  findHiddenOne(homeId: string, categoryId: string): Promise<HiddenCategory | null>;
}

export const CATEGORIES_REPOSITORY = Symbol("CATEGORIES_REPOSITORY");
