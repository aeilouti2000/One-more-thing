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

  /** The bytes, while the photo is still kept in Postgres. Not selected by default. */
  @Column({ type: "bytea", select: false, nullable: true })
  data: Buffer | null;

  /** Where the bytes are: "db" (data above) or "object" (storage, see common/storage/keys.ts). */
  @Column({ type: "text", default: "db" })
  storage: "db" | "object";

  @Column({ type: "int", nullable: true })
  bytes: number | null;

  @Column({ name: "thumb_bytes", type: "int", nullable: true })
  thumbBytes: number | null;

  /** A ~30-byte blurred preview the app shows while the photo loads (https://evanw.github.io/thumbhash/). */
  @Column({ type: "text", nullable: true })
  thumbhash: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
