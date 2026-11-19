import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { ItemCategory } from "./item.entity";

/** Sets per home. */
export const SET_LIMIT = 20;
/** Items in one set. */
export const SET_ITEM_LIMIT = 30;

export type SetItem = {
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
};

/** A saved group of items the home adds to a list in one tap. */
@Entity("item_sets")
export class ItemSet {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @Column({ type: "varchar", length: 60 })
  name: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  items: SetItem[];

  /** Null once the author deletes their account (the set stays). */
  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
