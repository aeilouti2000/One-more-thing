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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @OneToMany(() => HomeMember, (member) => member.home)
  members: HomeMember[];
}
