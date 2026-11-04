import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Trip totals ("invoices"): when a home asks for the trip total instead of
 * per-item costs, one receipt row holds the amount and the trip's items point
 * at it.
 */
export class TripReceipts1740000000012 implements MigrationInterface {
  name = "TripReceipts1740000000012";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column if not exists trip_cost_mode varchar(8) not null default 'items'
    `);
    await queryRunner.query(`
      create table if not exists trip_receipts (
        id uuid primary key default gen_random_uuid(),
        home_id uuid not null references homes(id) on delete cascade,
        list_id uuid null references lists(id) on delete set null,
        total numeric(12, 3) not null,
        -- Nullable: deleting an account must keep the household's trip totals.
        created_by uuid null references users(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists trip_receipts_home_idx on trip_receipts (home_id, created_at desc)
    `);
    await queryRunner.query(`
      alter table items
        add column if not exists receipt_id uuid null references trip_receipts(id) on delete set null
    `);
    await queryRunner.query(`
      create index if not exists items_receipt_idx on items (receipt_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists items_receipt_idx`);
    await queryRunner.query(`alter table items drop column if exists receipt_id`);
    await queryRunner.query(`drop table if exists trip_receipts`);
    await queryRunner.query(`alter table homes drop column if exists trip_cost_mode`);
  }
}
