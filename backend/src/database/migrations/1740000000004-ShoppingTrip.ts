import { MigrationInterface, QueryRunner } from "typeorm";

export class ShoppingTrip1740000000004 implements MigrationInterface {
  name = "ShoppingTrip1740000000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table items
      add column if not exists urgent_before_bought boolean not null default false
    `);

    await queryRunner.query(`
      create table if not exists staples (
        id uuid primary key default gen_random_uuid(),
        home_id uuid not null references homes (id) on delete cascade,
        name text not null,
        quantity numeric(10, 2) not null check (quantity > 0),
        unit text,
        category text not null check (
          category in ('vegetables', 'meat', 'supermarket', 'pharmacy', 'coffee', 'other')
        ),
        urgent boolean not null default false,
        interval_days int not null check (interval_days in (1, 7, 14, 30)),
        next_due_at timestamptz not null,
        created_by uuid not null references users (id),
        created_at timestamptz not null default now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists staples`);
    await queryRunner.query(`alter table items drop column if exists urgent_before_bought`);
  }
}
