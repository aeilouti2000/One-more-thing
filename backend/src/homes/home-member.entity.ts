import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { Home } from "./home.entity";

export type MemberRole = "owner" | "partner";

@Entity("home_members")
export class HomeMember {
  @PrimaryColumn({ name: "home_id", type: "uuid" })
  homeId: string;

  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => Home, (home) => home.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "home_id" })
  home: Home;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ type: "varchar" })
  role: MemberRole;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
