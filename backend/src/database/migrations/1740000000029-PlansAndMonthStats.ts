import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Plans and saved month totals.
 *
 * - A home's plan decides its limits, history length first. Every home starts
 *   on "early" (12 months of history) until billing exists.
 * - home_months and home_month_categories hold a month's totals. The clean-up
 *   job writes them once, just before it deletes that month's purchases, so
 *   totals and the recap outlive the purchases. Months still kept are summed
 *   from items when asked.
 */
export class PlansAndMonthStats1740000000029 implements MigrationInterface {
  name = "PlansAndMonthStats1740000000029";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column if not exists plan            text        not null default 'early',
        add column if not exists plan_until      timestamptz,
        add column if not exists plan_changed_at timestamptz not null default now()
    `);
    await queryRunner.query(`
      create table if not exists home_months (
        home_id      uuid    not null references homes (id) on delete cascade,
        month        date    not null,
        item_count   integer not null,
        priced_count integer not null,
        trip_count   integer not null,
        spend        numeric(14,3) not null,
        primary key (home_id, month)
      )
    `);
    await queryRunner.query(`
      create table if not exists home_month_categories (
        home_id    uuid    not null,
        month      date    not null,
        category   text    not null,
        item_count integer not null,
        spend      numeric(14,3) not null,
        primary key (home_id, month, category),
        foreign key (home_id, month) references home_months (home_id, month) on delete cascade
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists home_month_categories`);
    await queryRunner.query(`drop table if exists home_months`);
    await queryRunner.query(`
      alter table homes
        drop column if exists plan_changed_at, drop column if exists plan_until, drop column if exists plan
    `);
  }
}
