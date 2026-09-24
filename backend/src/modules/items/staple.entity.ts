import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../users/user.entity";
import { Home } from "../homes/home.entity";
import type { ItemCategory } from "./item.entity";

export const STAPLE_INTERVALS = [1, 7, 14, 30] as const;
export type StapleInterval = (typeof STAPLE_INTERVALS)[number];
export const STAPLE_LIMIT = 12;

const quantityTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

@Entity("staples")
export class Staple {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @ManyToOne(() => Home, { onDelete: "CASCADE" })
  @JoinColumn({ name: "home_id" })
  home: Home;

  @Column()
  name: string;

  @Column({
    type: "numeric",
    precision: 10,
    scale: 2,
    transformer: quantityTransformer,
  })
  quantity: number;

  @Column({ type: "varchar", nullable: true })
  unit: string | null;

  @Column({ type: "varchar" })
  category: ItemCategory;

  @Column({ type: "boolean", default: false })
  urgent: boolean;

  @Column({ name: "interval_days", type: "int" })
  intervalDays: StapleInterval;

  @Column({ name: "next_due_at", type: "timestamptz" })
  nextDueAt: Date;

  @Column({ name: "created_by", type: "uuid" })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "created_by" })
  createdByUser: User;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
