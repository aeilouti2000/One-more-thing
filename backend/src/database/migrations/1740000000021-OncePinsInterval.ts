import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * "Once" pins use interval 0, which the original check on staples rejected, so
 * creating one failed. Also indexes the due time the pins tick looks up.
 */
export class OncePinsInterval1740000000021 implements MigrationInterface {
  name = "OncePinsInterval1740000000021";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table staples drop constraint if exists staples_interval_days_check
    `);
    await queryRunner.query(`
      alter table staples
        add constraint staples_interval_days_check
        check (interval_days in (0, 1, 7, 14, 30))
    `);
    await queryRunner.query(`
      create index if not exists staples_next_due_at_idx on staples (next_due_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists staples_next_due_at_idx`);
    // Once pins cannot exist under the old rule.
    await queryRunner.query(`delete from staples where interval_days = 0`);
    await queryRunner.query(`
      alter table staples drop constraint if exists staples_interval_days_check
    `);
    await queryRunner.query(`
      alter table staples
        add constraint staples_interval_days_check
        check (interval_days in (1, 7, 14, 30))
    `);
  }
}
