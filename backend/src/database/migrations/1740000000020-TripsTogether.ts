import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Shopping trips: a summary when a trip ends, shopping one list together, and
 * marking an item "not found" in this shop.
 *
 * The shop lock becomes one row per shopper (list_id + user_id), so a home that
 * allows shopping together can have several shoppers on one list.
 */
export class TripsTogether1740000000020 implements MigrationInterface {
  name = "TripsTogether1740000000020";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column if not exists trip_summary boolean not null default true,
        add column if not exists trip_shop_together boolean not null default false
    `);
    await queryRunner.query(`
      alter table items
        add column if not exists not_found_at timestamptz null,
        add column if not exists not_found_by uuid null
          references users(id) on delete set null
    `);
    await queryRunner.query(`
      alter table list_shop_locks drop constraint if exists list_shop_locks_pkey
    `);
    await queryRunner.query(`
      alter table list_shop_locks add primary key (list_id, user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Back to one shopper per list: keep the newest heartbeat on each list.
    await queryRunner.query(`
      delete from list_shop_locks l
       using list_shop_locks newer
       where newer.list_id = l.list_id
         and (newer.heartbeat_at, newer.user_id) > (l.heartbeat_at, l.user_id)
    `);
    await queryRunner.query(`
      alter table list_shop_locks drop constraint if exists list_shop_locks_pkey
    `);
    await queryRunner.query(`alter table list_shop_locks add primary key (list_id)`);
    await queryRunner.query(`
      alter table items
        drop column if exists not_found_at,
        drop column if exists not_found_by
    `);
    await queryRunner.query(`
      alter table homes
        drop column if exists trip_summary,
        drop column if exists trip_shop_together
    `);
  }
}
