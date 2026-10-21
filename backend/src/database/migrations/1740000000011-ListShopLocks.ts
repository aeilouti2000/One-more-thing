import { MigrationInterface, QueryRunner } from "typeorm";

export class ListShopLocks1740000000011 implements MigrationInterface {
  name = "ListShopLocks1740000000011";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists list_shop_locks (
        list_id uuid primary key references lists (id) on delete cascade,
        home_id uuid not null references homes (id) on delete cascade,
        user_id uuid not null references users (id) on delete cascade,
        started_at timestamptz not null default now(),
        heartbeat_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create index if not exists list_shop_locks_home_id_idx
        on list_shop_locks (home_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists list_shop_locks_home_id_idx`);
    await queryRunner.query(`drop table if exists list_shop_locks`);
  }
}
