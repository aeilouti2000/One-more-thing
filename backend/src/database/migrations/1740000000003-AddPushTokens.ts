import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPushTokens1740000000003 implements MigrationInterface {
  name = "AddPushTokens1740000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists push_tokens (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users (id) on delete cascade,
        token text not null unique,
        locale text not null default 'en',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists push_tokens_user_id on push_tokens (user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists push_tokens`);
  }
}
