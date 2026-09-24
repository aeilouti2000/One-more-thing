import { MigrationInterface, QueryRunner } from "typeorm";

export class DropEmailConfirmation1740000000001 implements MigrationInterface {
  name = "DropEmailConfirmation1740000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists email_tokens`);
    await queryRunner.query(`alter table users drop column if exists email_verified_at`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table users add column if not exists email_verified_at timestamptz`);
    await queryRunner.query(`
      create table if not exists email_tokens (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users (id) on delete cascade,
        token_hash text not null unique,
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      )
    `);
  }
}
