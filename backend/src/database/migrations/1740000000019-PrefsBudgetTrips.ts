import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Each person chooses which kinds of notification they get; a home can have a
 * monthly budget and two shopping-trip options.
 */
export class PrefsBudgetTrips1740000000019 implements MigrationInterface {
  name = "PrefsBudgetTrips1740000000019";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table users
        add column if not exists notify_added boolean not null default true,
        add column if not exists notify_urgent boolean not null default true,
        add column if not exists notify_due boolean not null default true
    `);
    await queryRunner.query(`
      alter table homes
        add column if not exists monthly_budget numeric(12,3) null,
        add column if not exists trip_ask_name boolean not null default false,
        add column if not exists trip_auto_end_hours int null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        drop column if exists monthly_budget,
        drop column if exists trip_ask_name,
        drop column if exists trip_auto_end_hours
    `);
    await queryRunner.query(`
      alter table users
        drop column if exists notify_added,
        drop column if exists notify_urgent,
        drop column if exists notify_due
    `);
  }
}
