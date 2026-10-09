import { randomBytes } from "crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { DomainError } from "../../../../common/domain.error";
import { User } from "../../../../users/user.entity";
import { ShoppingList } from "../../../items/entities/shopping-list.entity";
import { Home } from "../../entities/home.entity";
import { HomeMember, type MemberRole } from "../../entities/home-member.entity";
import { Household, HouseholdMember, HomeSummary, IHomesRepository } from "./homes.repository";

@Injectable()
export class TypeormHomesRepository implements IHomesRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(HomeMember) private readonly members: Repository<HomeMember>,
  ) {}

  findMember(homeId: string, userId: string) {
    return this.members.findOne({ where: { homeId, userId } });
  }

  resolveActive(userId: string) {
    return this.resolveActiveMembership(userId);
  }

  loadHome(homeId: string) {
    return this.loadHousehold(homeId);
  }

  async listForUser(userId: string): Promise<HomeSummary[]> {
    const memberships = await this.members.find({
      where: { userId },
      order: { createdAt: "ASC" },
    });
    if (memberships.length === 0) return [];

    const homeIds = memberships.map((membership) => membership.homeId);
    const [homes, people] = await Promise.all([
      this.dataSource.getRepository(Home).find({ where: { id: In(homeIds) } }),
      this.members.find({
        where: { homeId: In(homeIds) },
        relations: { user: true },
        order: { createdAt: "ASC" },
      }),
    ]);
    const homesById = new Map(homes.map((home) => [home.id, home]));
    const membersByHome = new Map<string, HouseholdMember[]>();
    for (const person of people) {
      const list = membersByHome.get(person.homeId) ?? [];
      list.push({
        id: person.userId,
        role: person.role,
        name: person.user?.name || "Member",
      });
      membersByHome.set(person.homeId, list);
    }

    return memberships.map((membership) => ({
      id: membership.homeId,
      name: homesById.get(membership.homeId)?.name ?? "",
      role: membership.role,
      members: membersByHome.get(membership.homeId) ?? [],
    }));
  }

  createWithOwner(userId: string, homeName: string, listName: string) {
    return this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(HomeMember);
      const homes = manager.getRepository(Home);

      const home = await homes.save(
        homes.create({
          name: homeName,
          inviteCode: await uniqueInviteCode(homes),
        }),
      );
      await members.save(
        members.create({
          homeId: home.id,
          userId,
          role: "owner",
        }),
      );
      await manager.getRepository(User).update(userId, { activeHomeId: home.id });
      await manager.getRepository(ShoppingList).save({ homeId: home.id, name: listName });
      return this.loadHousehold(home.id, manager);
    });
  }

  joinByCode(userId: string, inviteCode: string) {
    return this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(HomeMember);
      const homes = manager.getRepository(Home);
      const home = await homes.findOne({ where: { inviteCode } });
      if (!home) {
        throw new DomainError("UNKNOWN_INVITE_CODE", "Unknown invite code", HttpStatus.NOT_FOUND);
      }

      const alreadyThere = await members.findOne({ where: { userId, homeId: home.id } });
      if (alreadyThere) {
        throw new DomainError(
          "ALREADY_HOME_MEMBER",
          "You are already in this home.",
          HttpStatus.CONFLICT,
        );
      }
      await members.save(
        members.create({
          homeId: home.id,
          userId,
          role: "partner",
        }),
      );
      await manager.getRepository(User).update(userId, { activeHomeId: home.id });
      return this.loadHousehold(home.id, manager);
    });
  }

  async updateHome(homeId: string, patch: Partial<Home>) {
    await this.dataSource.getRepository(Home).update(homeId, patch);
  }

  async setActiveHome(userId: string, homeId: string | null) {
    await this.dataSource.getRepository(User).update(userId, { activeHomeId: homeId });
  }

  leave(userId: string, homeId: string) {
    return this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(HomeMember);
      const membership = await members.findOne({ where: { userId, homeId } });
      if (!membership) {
        throw new DomainError("NOT_HOME_MEMBER", "You do not belong to this home", HttpStatus.FORBIDDEN);
      }

      if (membership.role === "owner") {
        throw new DomainError(
          "HOST_CANNOT_LEAVE",
          "The host cannot leave this home.",
          HttpStatus.BAD_REQUEST,
        );
      }

      const replacement = await members
        .createQueryBuilder("member")
        .where("member.homeId = :homeId", { homeId })
        .andWhere("member.userId != :userId", { userId })
        .orderBy("member.created_at", "ASC")
        .getOne();

      if (!replacement) {
        await manager.getRepository(Home).delete(homeId);
      } else {
        await members.delete({ homeId, userId });
      }

      const remaining = await members.find({
        where: { userId },
        order: { createdAt: "ASC" },
      });
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        select: { id: true, activeHomeId: true },
      });
      const activeStillThere = remaining.some((row) => row.homeId === user?.activeHomeId);
      const nextHomeId = activeStillThere
        ? (user?.activeHomeId ?? null)
        : (remaining[0]?.homeId ?? null);
      await manager.getRepository(User).update(userId, { activeHomeId: nextHomeId });
      return {
        home: nextHomeId ? await this.loadHousehold(nextHomeId, manager) : null,
      };
    });
  }

  async deletePartner(homeId: string, memberId: string) {
    const result = await this.members.delete({ homeId, userId: memberId, role: "partner" });
    return result.affected ?? 0;
  }

  findUser(userId: string) {
    return this.dataSource.getRepository(User).findOne({ where: { id: userId } });
  }

  private async resolveActiveMembership(userId: string, manager = this.dataSource.manager) {
    const members = manager.getRepository(HomeMember);
    const memberships = await members.find({
      where: { userId },
      order: { createdAt: "ASC" },
    });
    if (memberships.length === 0) return null;

    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      select: { id: true, activeHomeId: true },
    });
    const active =
      memberships.find((membership) => membership.homeId === user?.activeHomeId) ?? memberships[0];
    if (user && user.activeHomeId !== active.homeId) {
      await manager.getRepository(User).update(userId, { activeHomeId: active.homeId });
    }
    return active;
  }

  private async loadHousehold(homeId: string, manager = this.dataSource.manager): Promise<Household> {
    const home = await manager.getRepository(Home).findOne({ where: { id: homeId } });
    if (!home) {
      throw new DomainError("HOME_NOT_FOUND", "Home not found", HttpStatus.NOT_FOUND);
    }
    const rows = await manager
      .getRepository(HomeMember)
      .createQueryBuilder("member")
      .innerJoin(User, "user", "user.id = member.userId")
      .where("member.homeId = :homeId", { homeId })
      .select("member.userId", "id")
      .addSelect("member.role", "role")
      .addSelect("user.name", "name")
      .orderBy("member.created_at", "ASC")
      .getRawMany<{ id: string; role: MemberRole; name: string }>();

    return {
      id: home.id,
      name: home.name,
      inviteCode: home.inviteCode,
      createdAt: home.createdAt,
      costsEnabled: home.costsEnabled,
      currency: home.currency,
      askCostOnSingleBuy: home.askCostOnSingleBuy,
      askCostOnBulkBuy: home.askCostOnBulkBuy,
      askCostOnTripEnd: home.askCostOnTripEnd,
      members: rows.map((row) => ({
        id: row.id,
        role: row.role,
        name: row.name || "Member",
      })),
    };
  }
}

async function uniqueInviteCode(homes: Repository<Home>) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = `OMT-${randomBytes(4).toString("hex").toUpperCase()}`;
    const taken = await homes.exist({ where: { inviteCode } });
    if (!taken) return inviteCode;
  }
  throw new DomainError("INVITE_CODE_FAILED", "Could not create an invite code", HttpStatus.INTERNAL_SERVER_ERROR);
}
