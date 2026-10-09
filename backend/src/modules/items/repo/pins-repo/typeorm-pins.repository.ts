import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Pin } from "../../entities/pin.entity";
import { IPinsRepository, type NewPinInput } from "./pins.repository";

@Injectable()
export class TypeormPinsRepository implements IPinsRepository {
  constructor(@InjectRepository(Pin) private readonly pins: Repository<Pin>) {}

  findByHome(homeId: string) {
    return this.pins.find({ where: { homeId }, order: { name: "ASC" } });
  }

  count(homeId: string) {
    return this.pins.count({ where: { homeId } });
  }

  insert(input: NewPinInput) {
    return this.pins.save(this.pins.create(input));
  }

  findInHome(pinId: string, homeId: string) {
    return this.pins.findOne({ where: { id: pinId, homeId } });
  }

  async deleteById(pinId: string) {
    await this.pins.delete({ id: pinId });
  }

  findDue(homeId: string) {
    return this.pins
      .createQueryBuilder("pin")
      .where("pin.home_id = :homeId", { homeId })
      .andWhere("pin.next_due_at <= now()")
      .getMany();
  }

  async findDueHomeIds() {
    const rows = await this.pins
      .createQueryBuilder("pin")
      .select("pin.home_id", "homeId")
      .where("pin.next_due_at <= now()")
      .distinct(true)
      .getRawMany<{ homeId: string }>();
    return rows.map((row) => row.homeId).filter(Boolean);
  }

  async claimDue(pinId: string, nextDueAt: Date) {
    const result = await this.pins
      .createQueryBuilder()
      .update(Pin)
      .set({ nextDueAt })
      .where("id = :pinId", { pinId })
      .andWhere("next_due_at <= now()")
      .execute();
    return (result.affected ?? 0) > 0;
  }

  save(pin: Pin) {
    return this.pins.save(pin);
  }

  async reassignCategory(homeId: string, categoryId: string, fallback: string) {
    await this.pins.update({ homeId, category: categoryId }, { category: fallback });
  }
}
