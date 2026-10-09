import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { HomeMember } from "./home-member.entity";

@Entity("homes")
export class Home {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ name: "invite_code", unique: true })
  inviteCode: string;

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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @OneToMany(() => HomeMember, (member) => member.home)
  members: HomeMember[];
}
