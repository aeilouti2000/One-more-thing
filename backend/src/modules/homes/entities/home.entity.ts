import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { HomeMember } from "./home-member.entity";

export const TRIP_COST_MODES = ["items", "total"] as const;
export type TripCostMode = (typeof TRIP_COST_MODES)[number];

export const TRIP_AUTO_END_HOURS = [2, 4, 8] as const;

@Entity("homes")
export class Home {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ name: "invite_code", unique: true })
  inviteCode: string;

  /** The home's plan (see modules/plans/plans.ts). Changed by hand until billing exists. */
  @Column({ type: "text", default: "early" })
  plan: string;

  @Column({ name: "plan_until", type: "timestamptz", nullable: true })
  planUntil: Date | null;

  @Column({ name: "plan_changed_at", type: "timestamptz", default: () => "now()" })
  planChangedAt: Date;

  /** IANA time zone, set by the first phone that syncs (see common/home-time.ts). */
  @Column({ type: "text", nullable: true })
  timezone: string | null;

  @Column({ name: "costs_enabled", type: "boolean", default: false })
  costsEnabled: boolean;

  @Column({ type: "varchar", length: 8, default: "JOD" })
  currency: string;

  @Column({ name: "ask_cost_on_single_buy", type: "boolean", default: true })
  askCostOnSingleBuy: boolean;

  @Column({ name: "ask_cost_on_bulk_buy", type: "boolean", default: true })
  askCostOnBulkBuy: boolean;

  @Column({ name: "ask_cost_on_trip_end", type: "boolean", default: true })
  askCostOnTripEnd: boolean;

  /** End-of-trip prompt: price each item, or enter one total for the trip. */
  @Column({ name: "trip_cost_mode", type: "varchar", length: 8, default: "items" })
  tripCostMode: TripCostMode;

  /** Host-only switch: when off, nobody in this home gets list notifications. */
  @Column({ name: "notifications_enabled", type: "boolean", default: true })
  notificationsEnabled: boolean;

  /** What the home plans to spend in a calendar month; null = no budget. */
  @Column({
    name: "monthly_budget",
    type: "numeric",
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | number | null) => (value === null || value === undefined ? null : Number(value)),
    },
  })
  monthlyBudget: number | null;

  /** Ask for a name (e.g. the shop) when a shopping trip ends. */
  @Column({ name: "trip_ask_name", type: "boolean", default: false })
  tripAskName: boolean;

  /** A trip left open ends by itself after this many hours; null = never. */
  @Column({ name: "trip_auto_end_hours", type: "int", nullable: true })
  tripAutoEndHours: number | null;

  /** Show a short summary card when a shopping trip ends. */
  @Column({ name: "trip_summary", type: "boolean", default: true })
  tripSummary: boolean;

  /** Let more than one person shop the same list at the same time. */
  @Column({ name: "trip_shop_together", type: "boolean", default: false })
  tripShopTogether: boolean;

  /** Show the whole-trip estimate and what it leaves of the budget on a trip. */
  @Column({ name: "trip_estimate", type: "boolean", default: true })
  tripEstimate: boolean;

  /** Offer "Anything missing?" on a trip, to ask the rest of the home. */
  @Column({ name: "trip_ask_home", type: "boolean", default: true })
  tripAskHome: boolean;

  /** Show last month's recap in History at the start of a month. */
  @Column({ name: "monthly_recap", type: "boolean", default: true })
  monthlyRecap: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @OneToMany(() => HomeMember, (member) => member.home)
  members: HomeMember[];
}
