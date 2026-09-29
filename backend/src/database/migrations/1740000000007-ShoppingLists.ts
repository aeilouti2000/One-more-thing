import { MigrationInterface, QueryRunner } from "typeorm";

export class ShoppingLists1740000000007 implements MigrationInterface {
  name = "ShoppingLists1740000000007";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists lists (
        id uuid primary key default gen_random_uuid(),
        home_id uuid not null references homes (id) on delete cascade,
        name text not null,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      insert into lists (home_id, name)
      select home.id, 'List'
      from homes as home
      where not exists (
        select 1 from lists where lists.home_id = home.id
      )
    `);
    await queryRunner.query(`
      alter table items
      add column if not exists list_id uuid references lists (id) on delete cascade
    `);
    await queryRunner.query(`
      update items
      set list_id = lists.id
      from lists
      where items.list_id is null
        and lists.home_id = items.home_id
    `);
    await queryRunner.query(`
      alter table items
      alter column list_id set not null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table items drop column if exists list_id`);
    await queryRunner.query(`drop table if exists lists`);
  }
}
