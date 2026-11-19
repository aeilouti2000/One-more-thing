import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { isUniqueViolation } from "../../../common/db-errors";
import { DomainError } from "../../../common/domain.error";
import type { Home, TripCostMode } from "../entities/home.entity";
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

  async join(userId: string, code: string) {
    try {
      return await this.homes.joinByCode(userId, code.trim().toUpperCase());
    } catch (error) {
      // A double tap: the first request joined while this one was checking.
      if (isUniqueViolation(error)) {
        throw new DomainError("ALREADY_HOME_MEMBER", "You are already in this home.", HttpStatus.CONFLICT);
      }
      throw error;
    }
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
      tripCostMode?: TripCostMode;
      monthlyBudget?: number | null;
      monthlyRecap?: boolean;
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
    if (input.tripCostMode === "items" || input.tripCostMode === "total") {
      patch.tripCostMode = input.tripCostMode;
    }

    if (input.monthlyBudget === null || typeof input.monthlyBudget === "number") {
      patch.monthlyBudget = input.monthlyBudget;
    }

    if (typeof input.monthlyRecap === "boolean") patch.monthlyRecap = input.monthlyRecap;

    if (Object.keys(patch).length > 0) {
      await this.homes.updateHome(homeId, patch);
    }
    return this.homes.loadHome(homeId);
  }

  async updateTripSettings(
    userId: string,
    homeId: string,
    input: {
      tripAskName?: boolean;
      tripAutoEndHours?: number | null;
      tripSummary?: boolean;
      tripShopTogether?: boolean;
      tripEstimate?: boolean;
      tripAskHome?: boolean;
    },
  ) {
    const membership = await this.requireMembership(userId, homeId);
    if (membership.role !== "owner") {
      throw new DomainError(
        "ONLY_HOST_CAN_UPDATE_TRIPS",
        "Only the host can change trip settings",
        HttpStatus.FORBIDDEN,
      );
    }
    const patch: Partial<Home> = {};
    if (typeof input.tripAskName === "boolean") patch.tripAskName = input.tripAskName;
    if (input.tripAutoEndHours === null || typeof input.tripAutoEndHours === "number") {
      patch.tripAutoEndHours = input.tripAutoEndHours;
    }
    if (typeof input.tripSummary === "boolean") patch.tripSummary = input.tripSummary;
    if (typeof input.tripShopTogether === "boolean") {
      patch.tripShopTogether = input.tripShopTogether;
    }
    if (typeof input.tripEstimate === "boolean") patch.tripEstimate = input.tripEstimate;
    if (typeof input.tripAskHome === "boolean") patch.tripAskHome = input.tripAskHome;
    if (Object.keys(patch).length > 0) await this.homes.updateHome(homeId, patch);
    return this.homes.loadHome(homeId);
  }

  async updateNotificationSettings(userId: string, homeId: string, notificationsEnabled: boolean) {
    const membership = await this.requireMembership(userId, homeId);
    if (membership.role !== "owner") {
      throw new DomainError(
        "ONLY_HOST_CAN_UPDATE_NOTIFICATIONS",
        "Only the host can change home notifications",
        HttpStatus.FORBIDDEN,
      );
    }
    await this.homes.updateHome(homeId, { notificationsEnabled });
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

  async deleteHome(userId: string, homeId: string) {
    const membership = await this.requireMembership(userId, homeId);
    if (membership.role !== "owner") {
      throw new DomainError(
        "ONLY_HOST_CAN_DELETE",
        "Only the host can delete this home",
        HttpStatus.FORBIDDEN,
      );
    }
    const mine = await this.homes.listForUser(userId);
    if (mine.length <= 1) {
      throw new DomainError("LAST_HOME", "You have to stay in a home.", HttpStatus.BAD_REQUEST);
    }
    return this.homes.deleteOwnedHome(userId, homeId);
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
