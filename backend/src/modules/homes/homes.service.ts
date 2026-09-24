import { randomBytes } from "crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { DomainError } from "../../common/domain.error";
import { User } from "../../users/user.entity";
import { HomeMember, type MemberRole } from "./home-member.entity";
import { Home } from "./home.entity";

export type HouseholdMember = {
  id: string;
  role: MemberRole;
  name: string;
};

export type Household = {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: Date;
  members: HouseholdMember[];
};

export type HomeSummary = {
  id: string;
  name: string;
  role: MemberRole;
};

@Injectable()
export class HomesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(HomeMember) private readonly members: Repository<HomeMember>,
  ) {}

  async getMine(userId: string): Promise<Household | null> {
    const membership = await this.resolveActive(userId);
    if (!membership) return null;
    return this.loadHousehold(membership.homeId);
  }

  async list(userId: string): Promise<HomeSummary[]> {
    return this.members
      .createQueryBuilder("member")
      .innerJoin(Home, "home", "home.id = member.homeId")
      .where("member.userId = :userId", { userId })
      .select("home.id", "id")
      .addSelect("home.name", "name")
      .addSelect("member.role", "role")
      .orderBy("member.created_at", "ASC")
      .getRawMany<HomeSummary>();
  }

  async create(userId: string, name: string) {
    const homeName = name.trim();
    if (!homeName) {
      throw new DomainError("FAMILY_NAME_REQUIRED", "Family name is required", HttpStatus.BAD_REQUEST);
    }

    return this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(HomeMember);
      const homes = manager.getRepository(Home);
      const existing = await members.findOne({ where: { userId } });
      if (existing) {
        throw new DomainError("ALREADY_IN_HOME", "You already belong to a home", HttpStatus.CONFLICT);
      }

      const home = await homes.save(
        homes.create({
          name: homeName,
          inviteCode: await this.uniqueInviteCode(homes),
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
      return this.loadHousehold(home.id, manager);
    });
  }

  async join(userId: string, code: string) {
    const inviteCode = code.trim().toUpperCase();
    return this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(HomeMember);
      const homes = manager.getRepository(Home);
      const home = await homes.findOne({ where: { inviteCode } });
      if (!home) {
        throw new DomainError("UNKNOWN_INVITE_CODE", "Unknown invite code", HttpStatus.NOT_FOUND);
      }

      const alreadyThere = await members.findOne({ where: { userId, homeId: home.id } });
      if (!alreadyThere) {
        await members.save(
          members.create({
            homeId: home.id,
            userId,
            role: "partner",
          }),
        );
      }
      await manager.getRepository(User).update(userId, { activeHomeId: home.id });
      return this.loadHousehold(home.id, manager);
    });
  }

  async updateName(userId: string, homeId: string, name: string) {
    const homeName = name.trim();
    if (!homeName) {
      throw new DomainError("FAMILY_NAME_REQUIRED", "Family name is required", HttpStatus.BAD_REQUEST);
    }
    await this.requireMembership(userId, homeId);
    await this.dataSource.getRepository(Home).update(homeId, { name: homeName });
    return this.loadHousehold(homeId);
  }

  async switchHome(userId: string, homeId: string) {
    await this.requireMembership(userId, homeId);
    await this.dataSource.getRepository(User).update(userId, { activeHomeId: homeId });
    return this.loadHousehold(homeId);
  }

  async leave(userId: string, homeId: string) {
    await this.requireMembership(userId, homeId);
    return this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(HomeMember);
      const membership = await members.findOne({ where: { userId, homeId } });
      if (!membership) {
        throw new DomainError("NOT_HOME_MEMBER", "You do not belong to this home", HttpStatus.FORBIDDEN);
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
        if (membership.role === "owner") {
          await members.update({ homeId, userId: replacement.userId }, { role: "owner" });
        }
        await members.delete({ homeId, userId });
      }

      const remaining = await members.find({
        where: { userId },
        order: { createdAt: "ASC" },
      });
      const nextHomeId = remaining[0]?.homeId ?? null;
      await manager.getRepository(User).update(userId, { activeHomeId: nextHomeId });
      return {
        home: nextHomeId ? await this.loadHousehold(nextHomeId, manager) : null,
      };
    });
  }

  async removeMember(actorId: string, homeId: string, memberId: string) {
    if (memberId === actorId) {
      throw new DomainError("HOST_CANNOT_REMOVE_SELF", "The host cannot remove themselves", HttpStatus.BAD_REQUEST);
    }

    const actor = await this.members.findOne({ where: { homeId, userId: actorId } });
    if (!actor || actor.role !== "owner") {
      throw new DomainError("ONLY_HOST_CAN_REMOVE", "Only the host can remove members", HttpStatus.FORBIDDEN);
    }

    const result = await this.members.delete({ homeId, userId: memberId, role: "partner" });
    if (!result.affected) {
      throw new DomainError("MEMBER_NOT_FOUND", "Member not found", HttpStatus.NOT_FOUND);
    }
    return { removed: true };
  }

  async requireMembership(userId: string, homeId?: string) {
    const membership = homeId
      ? await this.members.findOne({ where: { userId, homeId } })
      : await this.resolveActive(userId);
    if (!membership) {
      throw new DomainError("NOT_HOME_MEMBER", "You do not belong to this home", HttpStatus.FORBIDDEN);
    }
    return membership;
  }

  private async resolveActive(userId: string, manager = this.dataSource.manager) {
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

  private async uniqueInviteCode(homes: Repository<Home>) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const inviteCode = `OMT-${randomBytes(4).toString("hex").toUpperCase()}`;
      const taken = await homes.exist({ where: { inviteCode } });
      if (!taken) return inviteCode;
    }
    throw new DomainError("INVITE_CODE_FAILED", "Could not create an invite code", HttpStatus.INTERNAL_SERVER_ERROR);
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
      members: rows.map((row) => ({
        id: row.id,
        role: row.role,
        name: row.name || "Member",
      })),
    };
  }
}
