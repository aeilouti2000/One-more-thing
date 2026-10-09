import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("custom_home_categories")
export class CustomCategory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @Column()
  name: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
