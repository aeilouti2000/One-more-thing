import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

/** The resized photo attached to an item (see items.image_id). */
@Entity("item_images")
export class ItemImage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "item_id", type: "uuid" })
  itemId: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @Column({ name: "mime_type", type: "varchar" })
  mimeType: string;

  @Column({ type: "int" })
  width: number;

  @Column({ type: "int" })
  height: number;

  /** Not selected by default: only the image endpoint reads the bytes. */
  @Column({ type: "bytea", select: false })
  data: Buffer;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
