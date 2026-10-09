import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { DomainError } from "../../../common/domain.error";
import type { Home } from "../entities/home.entity";
import {
  HOMES_REPOSITORY,
  type HomeSummary,
  type Household,
  type IHomesRepository,
} from "../repo/homes-repo/homes.repository";

export type { HomeSummary, Household, HouseholdMember } from "../repo/homes-repo/homes.repository";

@Injectable()
export class HomesService {
  constructor(@Inject(HOMES_REPOSITORY) private readonly homes: IHomesRepository) {}

  async getMine(userId: string): Promise<Household | null> {
    const membership = await this.homes.resolveActive(userId);
    if (!membership) return null;
    return this.homes.loadHome(membership.homeId);
  }

  list(userId: string): Promise<HomeSummary[]> {
    return this.homes.listForUser(userId);
  }

  async getOne(userId: string, homeId: string) {
    await this.requireMembership(userId, homeId);
    return this.homes.loadHome(homeId);
  }

  async create(userId: string, name: string, listName?: string) {
    const homeName = name.trim();
    if (!homeName) {
      throw new DomainError("FAMILY_NAME_REQUIRED", "Family name is required", HttpStatus.BAD_REQUEST);
    }
    const defaultListName = listName?.trim() || "List";
    return this.homes.createWithOwner(userId, homeName, defaultListName);
  }

  join(userId: string, code: string) {
    return this.homes.joinByCode(userId, code.trim().toUpperCase());
  }

  async updateName(userId: string, homeId: string, name: string) {
    const homeName = name.trim();
    if (!homeName) {
      throw new DomainError("FAMILY_NAME_REQUIRED", "Family name is required", HttpStatus.BAD_REQUEST);
    }
    const membership = await this.requireMembership(userId, homeId);
    if (membership.role !== "owner") {
      throw new DomainError(
        "ONLY_HOST_CAN_RENAME",
        "Only the host can change the home name",
        HttpStatus.FORBIDDEN,
      );
    }
    await this.homes.updateHome(homeId, { name: homeName });
    return this.homes.loadHome(homeId);
  }

  async updateCostSettings(
    userId: string,
    homeId: string,
    input: {
      costsEnabled?: boolean;
      currency?: string;
      askCostOnSingleBuy?: boolean;
      askCostOnBulkBuy?: boolean;
      askCostOnTripEnd?: boolean;
    },
  ) {
    const membership = await this.requireMembership(userId, homeId);
    if (membership.role !== "owner") {
      throw new DomainError(
        "ONLY_HOST_CAN_UPDATE_COSTS",
        "Only the host can change cost settings",
        HttpStatus.FORBIDDEN,
      );
    }

    const patch: Partial<Home> = {};
    if (typeof input.costsEnabled === "boolean") patch.costsEnabled = input.costsEnabled;
    if (typeof input.currency === "string") patch.currency = input.currency;
    if (typeof input.askCostOnSingleBuy === "boolean") patch.askCostOnSingleBuy = input.askCostOnSingleBuy;
    if (typeof input.askCostOnBulkBuy === "boolean") patch.askCostOnBulkBuy = input.askCostOnBulkBuy;
    if (typeof input.askCostOnTripEnd === "boolean") patch.askCostOnTripEnd = input.askCostOnTripEnd;

    if (Object.keys(patch).length > 0) {
      await this.homes.updateHome(homeId, patch);
    }
    return this.homes.loadHome(homeId);
  }

  async switchHome(userId: string, homeId: string) {
    await this.requireMembership(userId, homeId);
    await this.homes.setActiveHome(userId, homeId);
    return this.homes.loadHome(homeId);
  }

  async leave(userId: string, homeId: string) {
    await this.requireMembership(userId, homeId);
    return this.homes.leave(userId, homeId);
  }

  async removeMember(actorId: string, homeId: string, memberId: string) {
    if (memberId === actorId) {
      throw new DomainError("HOST_CANNOT_REMOVE_SELF", "The host cannot remove themselves", HttpStatus.BAD_REQUEST);
    }

    const actor = await this.homes.findMember(homeId, actorId);
    if (!actor || actor.role !== "owner") {
      throw new DomainError("ONLY_HOST_CAN_REMOVE", "Only the host can remove members", HttpStatus.FORBIDDEN);
    }

    const affected = await this.homes.deletePartner(homeId, memberId);
    if (!affected) {
      throw new DomainError("MEMBER_NOT_FOUND", "Member not found", HttpStatus.NOT_FOUND);
    }
    return { removed: true };
  }

  async requireMembership(userId: string, homeId?: string) {
    const membership = homeId
      ? await this.homes.findMember(homeId, userId)
      : await this.homes.resolveActive(userId);
    if (!membership) {
      throw new DomainError("NOT_HOME_MEMBER", "You do not belong to this home", HttpStatus.FORBIDDEN);
    }
    return membership;
  }
}
