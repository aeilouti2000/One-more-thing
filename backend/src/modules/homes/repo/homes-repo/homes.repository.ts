import type { User } from "../../../../users/user.entity";
import type { Home } from "../../entities/home.entity";
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
  listForUser(userId: string): Promise<HomeSummary[]>;
  createWithOwner(userId: string, homeName: string, listName: string): Promise<Household>;
  joinByCode(userId: string, inviteCode: string): Promise<Household>;
  updateHome(homeId: string, patch: Partial<Home>): Promise<void>;
  setActiveHome(userId: string, homeId: string | null): Promise<void>;
  leave(userId: string, homeId: string): Promise<{ home: Household | null }>;
  deleteOwnedHome(userId: string, homeId: string): Promise<{ home: Household | null }>;
  deletePartner(homeId: string, memberId: string): Promise<number>;
  findUser(userId: string): Promise<User | null>;
}

export const HOMES_REPOSITORY = Symbol("HOMES_REPOSITORY");
