import type { HomePlan } from "../../../plans/plans";
import type { Home, TripCostMode } from "../../entities/home.entity";
import type { HomeMember, MemberRole } from "../../entities/home-member.entity";

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
  costsEnabled: boolean;
  currency: string;
  askCostOnSingleBuy: boolean;
  askCostOnBulkBuy: boolean;
  askCostOnTripEnd: boolean;
  tripCostMode: TripCostMode;
  notificationsEnabled: boolean;
  monthlyBudget: number | null;
  tripAskName: boolean;
  tripAutoEndHours: number | null;
  tripSummary: boolean;
  tripShopTogether: boolean;
  tripEstimate: boolean;
  tripAskHome: boolean;
  monthlyRecap: boolean;
  /** The plan and what it allows; the app shows locks from it, the server enforces it. */
  plan: HomePlan;
  members: HouseholdMember[];
};

export type HomeSummary = {
  id: string;
  name: string;
  role: MemberRole;
  members: HouseholdMember[];
};

export interface IHomesRepository {
  findMember(homeId: string, userId: string): Promise<HomeMember | null>;
  resolveActive(userId: string): Promise<HomeMember | null>;
  loadHome(homeId: string): Promise<Household>;
  /** Just the plan columns of a home. */
  loadPlan(homeId: string): Promise<{ plan: string; planUntil: Date | null } | null>;
  listForUser(userId: string): Promise<HomeSummary[]>;
  createWithOwner(userId: string, homeName: string, listName: string): Promise<Household>;
  joinByCode(userId: string, inviteCode: string): Promise<Household>;
  updateHome(homeId: string, patch: Partial<Home>): Promise<void>;
  setActiveHome(userId: string, homeId: string | null): Promise<void>;
  leave(userId: string, homeId: string): Promise<{ home: Household | null }>;
  deleteOwnedHome(userId: string, homeId: string): Promise<{ home: Household | null }>;
  deletePartner(homeId: string, memberId: string): Promise<number>;
}

export const HOMES_REPOSITORY = Symbol("HOMES_REPOSITORY");
