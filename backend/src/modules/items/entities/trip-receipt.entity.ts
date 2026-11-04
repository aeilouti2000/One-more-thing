import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

const moneyTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
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

  @Column({ type: "numeric", precision: 12, scale: 3, transformer: moneyTransformer })
  total: number;

  /** Null once the author deletes their account (the total stays). */
  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
