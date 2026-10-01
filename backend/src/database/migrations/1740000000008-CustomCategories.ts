import { MigrationInterface, QueryRunner } from "typeorm";

export class CustomCategories1740000000008 implements MigrationInterface {
  name = "CustomCategories1740000000008";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table items drop constraint if exists items_category_check`);
    await queryRunner.query(`alter table staples drop constraint if exists staples_category_check`);
    await queryRunner.query(`
      create table if not exists custom_home_categories (
        id uuid primary key default gen_random_uuid(),
        home_id uuid not null references homes (id) on delete cascade,
        name text not null,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create unique index if not exists custom_home_categories_name
      on custom_home_categories (home_id, lower(name))
    `);
    await queryRunner.query(`
      create table if not exists hidden_home_categories (
        home_id uuid not null references homes (id) on delete cascade,
        category_id text not null,
        primary key (home_id, category_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists hidden_home_categories`);
    await queryRunner.query(`drop table if exists custom_home_categories`);
  }
}
