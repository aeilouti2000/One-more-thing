import { MigrationInterface, QueryRunner } from "typeorm";

export class ItemSortOrder1740000000006 implements MigrationInterface {
  name = "ItemSortOrder1740000000006";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table items
      add column if not exists sort_order integer not null default 0
    `);
    await queryRunner.query(`
      with ranked as (
        select id,
          row_number() over (partition by home_id order by created_at desc) - 1 as pos
        from items
        where status = 'needed'
      )
      update items
      set sort_order = ranked.pos
      from ranked
      where items.id = ranked.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table items drop column if exists sort_order`);
  }
}
