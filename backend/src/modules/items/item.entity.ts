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

export const ITEM_CATEGORIES = [
  "vegetables",
  "meat",
  "supermarket",
  "pharmacy",
  "coffee",
  "other",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemStatus = "needed" | "bought";

const quantityTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

@Entity("items")
export class Item {
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

  @Column({ type: "varchar", nullable: true })
  notes: string | null;

  @Column({ type: "varchar", default: "needed" })
  status: ItemStatus;

  @Column({ type: "boolean", default: false })
  urgent: boolean;

  @Column({ name: "urgent_before_bought", type: "boolean", default: false })
  urgentBeforeBought: boolean;

  @Column({ name: "added_by", type: "uuid" })
  addedBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "added_by" })
  addedByUser: User;

  @Column({ name: "bought_by", type: "uuid", nullable: true })
  boughtBy: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: "bought_by" })
  boughtByUser: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "bought_at", type: "timestamptz", nullable: true })
  boughtAt: Date | null;
}
