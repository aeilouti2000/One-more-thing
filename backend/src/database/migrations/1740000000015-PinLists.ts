import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Each pin repeats onto a chosen list. Existing pins move to their home's
 * first active list, which is where they were added until now.
 */
export class PinLists1740000000015 implements MigrationInterface {
  name = "PinLists1740000000015";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table staples
        add column if not exists list_id uuid null references lists(id) on delete set null
    `);
    await queryRunner.query(`
      update staples s
         set list_id = (
           select l.id from lists l
            where l.home_id = s.home_id and l.deleted_at is null
            order by l.created_at asc
            limit 1
         )
       where s.list_id is null
    `);
    await queryRunner.query(`
      create index if not exists staples_list_idx on staples (home_id, list_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists staples_list_idx`);
    await queryRunner.query(`alter table staples drop column if exists list_id`);
  }
}
