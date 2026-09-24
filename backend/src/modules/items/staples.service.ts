import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DomainError } from "../../common/domain.error";
import { HomesService } from "../homes/homes.service";
import type { ItemCategory } from "./item.entity";
import { Item } from "./item.entity";
import { advanceDue } from "./shopping";
import { STAPLE_LIMIT, Staple, type StapleInterval } from "./staple.entity";

export type StapleView = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
  urgent: boolean;
  intervalDays: StapleInterval;
  nextDueAt: Date;
};

@Injectable()
export class StaplesService {
  constructor(
    @InjectRepository(Staple) private readonly staples: Repository<Staple>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    private readonly homes: HomesService,
  ) {}

  async list(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    const rows = await this.staples.find({ where: { homeId }, order: { name: "ASC" } });
    return rows.map(toView);
  }

  async add(
    userId: string,
    homeId: string,
    input: {
      name: string;
      quantity: number;
      category: ItemCategory;
      unit?: string;
      urgent?: boolean;
      intervalDays: StapleInterval;
    },
    createItem: (notify: boolean) => Promise<unknown>,
  ) {
    await this.homes.requireMembership(userId, homeId);
    const count = await this.staples.count({ where: { homeId } });
    if (count >= STAPLE_LIMIT) {
      throw new DomainError("STAPLE_LIMIT", "You can pin up to 12 items.", HttpStatus.CONFLICT);
    }

    const now = new Date();
    const staple = await this.staples.save(
      this.staples.create({
        homeId,
        name: input.name.trim(),
        quantity: input.quantity,
        category: input.category,
        unit: blankToNull(input.unit),
        urgent: input.urgent === true,
        intervalDays: input.intervalDays,
        nextDueAt: advanceDue(now, input.intervalDays, now),
        createdBy: userId,
      }),
    );
    await createItem(true);
    return toView(staple);
  }

  async remove(userId: string, stapleId: string) {
    const membership = await this.homes.requireMembership(userId);
    const staple = await this.staples.findOne({ where: { id: stapleId, homeId: membership.homeId } });
    if (!staple) {
      throw new DomainError("STAPLE_NOT_FOUND", "Pinned item not found", HttpStatus.NOT_FOUND);
    }
    await this.staples.delete({ id: staple.id });
    return { deleted: true };
  }

  async materializeDue(homeId: string, actorId: string) {
    const due = await this.staples
      .createQueryBuilder("staple")
      .where("staple.home_id = :homeId", { homeId })
      .andWhere("staple.next_due_at <= now()")
      .getMany();
    if (due.length === 0) return;

    const needed = await this.items.find({ where: { homeId, status: "needed" } });
    const names = new Set(needed.map((item) => item.name.trim().toLowerCase()));
    const now = new Date();

    for (const staple of due) {
      const key = staple.name.trim().toLowerCase();
      if (!names.has(key)) {
        await this.items.save(
          this.items.create({
            homeId,
            name: staple.name,
            quantity: staple.quantity,
            unit: staple.unit,
            category: staple.category,
            notes: null,
            status: "needed",
            urgent: staple.urgent,
            urgentBeforeBought: false,
            addedBy: actorId,
            boughtBy: null,
            boughtAt: null,
          }),
        );
        names.add(key);
      }
      staple.nextDueAt = advanceDue(staple.nextDueAt, staple.intervalDays, now);
      await this.staples.save(staple);
    }
  }
}

function toView(staple: Staple): StapleView {
  return {
    id: staple.id,
    name: staple.name,
    quantity: Number(staple.quantity),
    unit: staple.unit,
    category: staple.category,
    urgent: staple.urgent,
    intervalDays: staple.intervalDays,
    nextDueAt: staple.nextDueAt,
  };
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
