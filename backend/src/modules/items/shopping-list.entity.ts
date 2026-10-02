import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Home } from "../homes/home.entity";

@Entity("lists")
export class ShoppingList {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @ManyToOne(() => Home, { onDelete: "CASCADE" })
  @JoinColumn({ name: "home_id" })
  home: Home;

  @Column()
  name: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt: Date | null;
}
