import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Each home chooses how long History is kept: 3, 6 or 12 months, default 3
 * (see modules/plans/history-period.ts). A shorter choice waits 30 days before
 * it applies; history_months_before and history_months_changed_at hold the
 * period in force meanwhile.
 *
 * Homes that exist today move to 3 months too, but only after a 30-day notice
 * that starts now: until then they keep the 12 months they had.
 *
 * The update bumps every home's change counter (the homes_version trigger does
 * not read omt.skip_sync). That is wanted: each phone's next changes answer
 * then carries the home with its new `history`, so the notice shows at once.
 */
export class HistoryPeriod1740000000033 implements MigrationInterface {
  name = "HistoryPeriod1740000000033";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column history_months smallint not null default 3
          constraint homes_history_months_check check (history_months in (3, 6, 12)),
        add column history_months_before smallint
          constraint homes_history_months_before_check check (history_months_before in (3, 6, 12)),
        add column history_months_changed_at timestamptz
    `);
    await queryRunner.query(`update homes set history_months_before = 12, history_months_changed_at = now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        drop column if exists history_months_changed_at,
        drop column if exists history_months_before,
        drop column if exists history_months
    `);
  }
}
