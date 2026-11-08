import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  /** Null for accounts that only sign in with Google. */
  @Column({ name: "password_hash", type: "varchar", nullable: true })
  passwordHash: string | null;

  /** Real email address (the `email` column above holds the username). */
  @Column({ name: "contact_email", type: "varchar", length: 254, nullable: true })
  contactEmail: string | null;

  @Column({ name: "email_verified_at", type: "timestamptz", nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: "google_sub", type: "varchar", length: 64, nullable: true })
  googleSub: string | null;

  @Column({ name: "google_email", type: "varchar", length: 254, nullable: true })
  googleEmail: string | null;

  @Column()
  name: string;

  @Column({ name: "active_home_id", type: "uuid", nullable: true })
  activeHomeId: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
