import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type EmailCodePurpose = "verify" | "reset";

/** A short-lived 6-digit code sent by email (stored hashed). */
@Entity("email_codes")
export class EmailCode {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 254 })
  email: string;

  @Column({ type: "varchar", length: 16 })
  purpose: EmailCodePurpose;

  @Column({ name: "code_hash", type: "text" })
  codeHash: string;

  @Column({ type: "int", default: 0 })
  attempts: number;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
