import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Four features share this step:
 * - Later shelf: an item can be parked (later_at) until a day (later_until).
 * - "Anything missing?": a shopper asks the home during a trip (shop_asks).
 * - Sets: saved groups of items a home adds in one tap (item_sets).
 * - Switches for the trip estimate, the ask card and the monthly recap, plus
 *   each person's choice to hear about asks and returning Later items.
 *
 * Every new column is optional or has a default, so existing rows are not
 * rewritten.
 */
export class LaterAsksSets1740000000024 implements MigrationInterface {
  name = "LaterAsksSets1740000000024";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column if not exists trip_estimate boolean not null default true,
        add column if not exists trip_ask_home boolean not null default true,
        add column if not exists monthly_recap boolean not null default true
    `);
    await queryRunner.query(`
      alter table users
        add column if not exists notify_shopping boolean not null default true,
        add column if not exists notify_later boolean not null default true
    `);
    await queryRunner.query(`
      alter table items
        add column if not exists later_at timestamptz null,
        add column if not exists later_until timestamptz null
    `);
    // Only parked items with a return day are indexed, so the release job
    // reads a handful of rows instead of the whole table.
    await queryRunner.query(`
      create index if not exists items_later_until_idx
        on items (later_until)
        where later_until is not null
    `);
    // "Who added what since the question": read on every check for answers.
    await queryRunner.query(`
      create index if not exists items_list_created_idx on items (list_id, created_at)
    `);
    await queryRunner.query(`
      create table if not exists shop_asks (
        id uuid primary key default gen_random_uuid(),
        home_id uuid not null references homes (id) on delete cascade,
        list_id uuid not null references lists (id) on delete cascade,
        asked_by uuid not null references users (id) on delete cascade,
        replies jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      )
    `);
    await queryRunner.query(`
      create index if not exists shop_asks_home_expires_idx on shop_asks (home_id, expires_at)
    `);
    await queryRunner.query(`
      create table if not exists item_sets (
        id uuid primary key default gen_random_uuid(),
        home_id uuid not null references homes (id) on delete cascade,
        name varchar(60) not null,
        items jsonb not null default '[]'::jsonb,
        created_by uuid null references users (id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists item_sets_home_id_idx on item_sets (home_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists item_sets`);
    await queryRunner.query(`drop table if exists shop_asks`);
    await queryRunner.query(`drop index if exists items_list_created_idx`);
    await queryRunner.query(`drop index if exists items_later_until_idx`);
    await queryRunner.query(`
      alter table items
        drop column if exists later_at,
        drop column if exists later_until
    `);
    await queryRunner.query(`
      alter table users
        drop column if exists notify_shopping,
        drop column if exists notify_later
    `);
    await queryRunner.query(`
      alter table homes
        drop column if exists trip_estimate,
        drop column if exists trip_ask_home,
        drop column if exists monthly_recap
    `);
  }
}
