import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { User } from "../../../users/user.entity";
import { Home } from "../../homes/entities/home.entity";
import { ShoppingList } from "./shopping-list.entity";

@Entity("list_shop_locks")
export class ListShopLock {
  @PrimaryColumn({ name: "list_id", type: "uuid" })
  listId: string;

  @ManyToOne(() => ShoppingList, { onDelete: "CASCADE" })
  @JoinColumn({ name: "list_id" })
  list: ShoppingList;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @ManyToOne(() => Home, { onDelete: "CASCADE" })
  @JoinColumn({ name: "home_id" })
  home: Home;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "started_at", type: "timestamptz" })
  startedAt: Date;

  @Column({ name: "heartbeat_at", type: "timestamptz" })
  heartbeatAt: Date;
}
