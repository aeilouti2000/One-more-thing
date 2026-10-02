import { MigrationInterface, QueryRunner } from "typeorm";

export class ItemCosts1740000000009 implements MigrationInterface {
  name = "ItemCosts1740000000009";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table homes
        add column if not exists costs_enabled boolean not null default false
    `);
    await queryRunner.query(`
      alter table homes
        add column if not exists currency varchar(8) not null default 'JOD'
    `);
    await queryRunner.query(`
      alter table homes
        add column if not exists ask_cost_on_single_buy boolean not null default true
    `);
    await queryRunner.query(`
      alter table homes
        add column if not exists ask_cost_on_bulk_buy boolean not null default true
    `);
    await queryRunner.query(`
      alter table homes
        add column if not exists ask_cost_on_trip_end boolean not null default true
    `);
    await queryRunner.query(`
      alter table items
        add column if not exists cost numeric(12, 3) null
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`alter table items drop column if exists cost`);
    await queryRunner.query(`alter table homes drop column if exists costs_enabled`);
    await queryRunner.query(`alter table homes drop column if exists currency`);
    await queryRunner.query(`alter table homes drop column if exists ask_cost_on_single_buy`);
    await queryRunner.query(`alter table homes drop column if exists ask_cost_on_bulk_buy`);
    await queryRunner.query(`alter table homes drop column if exists ask_cost_on_trip_end`);
  }
}
