import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CustomCategory } from "../../entities/custom-category.entity";
import { HiddenCategory } from "../../entities/hidden-category.entity";
import { ICategoriesRepository } from "./categories.repository";

@Injectable()
export class TypeormCategoriesRepository implements ICategoriesRepository {
  constructor(
    @InjectRepository(CustomCategory) private readonly custom: Repository<CustomCategory>,
    @InjectRepository(HiddenCategory) private readonly hidden: Repository<HiddenCategory>,
  ) {}

  findHidden(homeId: string) {
    return this.hidden.find({ where: { homeId } });
  }

  findCustom(homeId: string) {
    return this.custom.find({ where: { homeId }, order: { createdAt: "ASC" } });
  }

  findCustomByName(homeId: string, name: string) {
    return this.custom
      .createQueryBuilder("category")
      .where("category.home_id = :homeId", { homeId })
      .andWhere("lower(category.name) = lower(:name)", { name })
      .getOne();
  }

  insert(homeId: string, name: string) {
    return this.custom.save(this.custom.create({ homeId, name }));
  }

  findCustomInHome(categoryId: string, homeId: string) {
    return this.custom.findOne({ where: { id: categoryId, homeId } });
  }

  async hide(homeId: string, categoryId: string) {
    await this.hidden.save(this.hidden.create({ homeId, categoryId }));
  }

  async deleteCustom(categoryId: string, homeId: string) {
    await this.custom.delete({ id: categoryId, homeId });
  }

  findHiddenOne(homeId: string, categoryId: string) {
    return this.hidden.findOne({ where: { homeId, categoryId } });
  }
}
