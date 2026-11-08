import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../../users/user.entity";
import { Home } from "../../homes/entities/home.entity";
import type { ItemCategory } from "./item.entity";

/** 0 = once (manual only; never auto-returns to the list). */
export const PIN_INTERVALS = [0, 1, 7, 14, 30] as const;
export type PinInterval = (typeof PIN_INTERVALS)[number];
/** Pinned items per list. */
export const PIN_LIMIT = 15;

const quantityTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

@Entity("staples")
export class Pin {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  /** The list it repeats onto; null falls back to the home's first list. */
  @Column({ name: "list_id", type: "uuid", nullable: true })
  listId: string | null;

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
  intervalDays: PinInterval;

  /**
   * Monthly pins only: the day of the month it returns on (1–31; short
   * months use their last day). Null keeps the plain 30-day cycle.
   */
  @Column({ name: "month_day", type: "int", nullable: true })
  monthDay: number | null;

  /** Minutes east of UTC on the device that set monthDay (local day maths). */
  @Column({ name: "utc_offset_min", type: "int", default: 0 })
  utcOffsetMin: number;

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
