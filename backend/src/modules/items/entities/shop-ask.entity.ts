import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

/** "nothing" = needs nothing; "done" = finished adding what they needed. */
export type ShopAskReply = "nothing" | "done";

/** How long the home has to answer before the question goes away. */
export const SHOP_ASK_TTL_MS = 30 * 60_000;
/** The same shopper can't ask the same list again sooner than this. */
export const SHOP_ASK_COOLDOWN_MS = 10 * 60_000;

/** A shopper asking the rest of the home "anything missing?" during a trip. */
@Entity("shop_asks")
export class ShopAsk {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @Column({ name: "list_id", type: "uuid" })
  listId: string;

  @Column({ name: "asked_by", type: "uuid" })
  askedBy: string;

  /** user id → their answer. Written one key at a time (see ShopAsksService). */
  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  replies: Record<string, ShopAskReply>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;
}
