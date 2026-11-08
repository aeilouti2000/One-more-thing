import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Real email next to the username (for password reset and Google linking),
 * Google sign-in, and accounts with no password (Google-only).
 *
 * `users.email` stays the username column. The real address lives in
 * `contact_email`; only a verified address is unique, so typing someone
 * else's email can't lock them out.
 */
export class EmailAndGoogle1740000000013 implements MigrationInterface {
  name = "EmailAndGoogle1740000000013";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table users alter column password_hash drop not null`);
    await queryRunner.query(`
      alter table users
        add column if not exists contact_email varchar(254) null,
        add column if not exists email_verified_at timestamptz null,
        add column if not exists google_sub varchar(64) null,
        add column if not exists google_email varchar(254) null
    `);
    await queryRunner.query(`
      create unique index if not exists users_verified_contact_email_idx
        on users (contact_email) where email_verified_at is not null
    `);
    await queryRunner.query(`
      create unique index if not exists users_google_sub_idx
        on users (google_sub) where google_sub is not null
    `);
    await queryRunner.query(`
      create table if not exists email_codes (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        email varchar(254) not null,
        purpose varchar(16) not null,
        code_hash text not null,
        attempts int not null default 0,
        expires_at timestamptz not null,
        used_at timestamptz null,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists email_codes_user_idx on email_codes (user_id, purpose, created_at desc)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists email_codes`);
    await queryRunner.query(`drop index if exists users_google_sub_idx`);
    await queryRunner.query(`drop index if exists users_verified_contact_email_idx`);
    await queryRunner.query(`
      alter table users
        drop column if exists google_email,
        drop column if exists google_sub,
        drop column if exists email_verified_at,
        drop column if exists contact_email
    `);
  }
}
