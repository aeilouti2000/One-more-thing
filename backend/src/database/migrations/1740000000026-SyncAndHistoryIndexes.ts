import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Two indexes on items, built without blocking writes ("concurrently"), which
 * Postgres only allows outside a transaction.
 *
 * - items_home_version_idx: "what changed in this home since version N".
 * - items_home_bought_idx: History pages, month totals, the phone's two-month
 *   window and clean-up per home. Measured on 5 million rows: a History page
 *   of 30 reads 34 pages with it, 727 without.
 */
export class SyncAndHistoryIndexes1740000000026 implements MigrationInterface {
  name = "SyncAndHistoryIndexes1740000000026";
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create index concurrently if not exists items_home_version_idx on items (home_id, version)
    `);
    await queryRunner.query(`
      create index concurrently if not exists items_home_bought_idx
        on items (home_id, bought_at desc, id desc)
        where status = 'bought'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index concurrently if exists items_home_bought_idx`);
    await queryRunner.query(`drop index concurrently if exists items_home_version_idx`);
  }
}
