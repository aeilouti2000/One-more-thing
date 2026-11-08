import { MigrationInterface, QueryRunner } from "typeorm";

/** Monthly pins can return on a chosen day of the month. */
export class PinMonthDay1740000000016 implements MigrationInterface {
  name = "PinMonthDay1740000000016";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table staples
        add column if not exists month_day int null
          check (month_day between 1 and 31),
        add column if not exists utc_offset_min int not null default 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table staples
        drop column if exists utc_offset_min,
        drop column if exists month_day
    `);
  }
}
