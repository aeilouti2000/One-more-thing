import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("hidden_home_categories")
export class HiddenCategory {
  @PrimaryColumn({ name: "home_id", type: "uuid" })
  homeId: string;

  @PrimaryColumn({ name: "category_id", type: "text" })
  categoryId: string;
}
