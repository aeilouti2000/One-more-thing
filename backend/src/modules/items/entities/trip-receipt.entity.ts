import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

const moneyTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) => (value === null ? null : Number(value)),
};

/** Total paid for one shopping trip, entered instead of per-item costs. */
@Entity("trip_receipts")
export class TripReceipt {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "home_id", type: "uuid" })
  homeId: string;

  @Column({ name: "list_id", type: "uuid", nullable: true })
  listId: string | null;

  /** Null until a total is entered (named trip, or an item moved in). */
  @Column({
    type: "numeric",
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: moneyTransformer,
  })
  total: number | null;

  /** Optional label, e.g. the shop's name. */
  @Column({ type: "varchar", length: 80, nullable: true })
  name: string | null;

  /** Null once the author deletes their account (the total stays). */
  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
