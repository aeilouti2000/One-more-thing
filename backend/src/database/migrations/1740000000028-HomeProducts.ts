import { MigrationInterface, QueryRunner } from "typeorm";
import { nameKey } from "../../modules/items/utils/name-key";

/**
 * One row per home and item name: what it was last called, its category and
 * unit, its last price, when it was last bought and how often. Name
 * suggestions and last prices read this small table instead of the whole
 * purchase history, and it is never cleaned, so suggestions survive when old
 * history is deleted.
 *
 * Filled once here from existing purchases. The names are keyed in
 * TypeScript, with the same function the server uses from now on, so the
 * filled rows and future rows always agree.
 */
export class HomeProducts1740000000028 implements MigrationInterface {
  name = "HomeProducts1740000000028";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists home_products (
        id             uuid primary key default gen_random_uuid(),
        home_id        uuid not null references homes (id) on delete cascade,
        name_key       text not null,
        name           text not null,
        category       text not null,
        unit           text,
        last_cost      numeric(12,3),
        last_cost_qty  numeric(10,2),
        last_cost_unit text,
        last_cost_at   timestamptz,
        last_bought_at timestamptz not null,
        times_bought   integer not null default 1,
        version        bigint not null default 0,
        unique (home_id, name_key)
      )
    `);
    await queryRunner.query(`
      create index if not exists home_products_home_version_idx on home_products (home_id, version)
    `);

    await queryRunner.query(`set local omt.skip_sync = 'on'`);
    const homes: { home_id: string }[] = await queryRunner.query(
      `select distinct home_id from items where status = 'bought'`,
    );
    for (const { home_id: homeId } of homes) {
      const rows: PurchaseRow[] = await queryRunner.query(
        `select name, category, unit, quantity, cost, coalesce(bought_at, created_at) as at
           from items
          where home_id = $1 and status = 'bought'
          order by coalesce(bought_at, created_at) desc, id desc`,
        [homeId],
      );
      const products = summarize(rows);
      for (let start = 0; start < products.length; start += 200) {
        const batch = products.slice(start, start + 200);
        const params: unknown[] = [];
        const values = batch.map((product) => {
          const base = params.length;
          params.push(
            homeId, product.key, product.name, product.category, product.unit,
            product.lastCost, product.lastCostQty, product.lastCostUnit, product.lastCostAt,
            product.lastBoughtAt, product.timesBought,
          );
          return `(${Array.from({ length: 11 }, (_, i) => `$${base + i + 1}`).join(", ")})`;
        });
        await queryRunner.query(
          `insert into home_products
             (home_id, name_key, name, category, unit, last_cost, last_cost_qty, last_cost_unit,
              last_cost_at, last_bought_at, times_bought)
           values ${values.join(", ")}
           on conflict (home_id, name_key) do nothing`,
          params,
        );
      }
    }
    await queryRunner.query(`set local omt.skip_sync = 'off'`);

    await queryRunner.query(`drop trigger if exists home_products_version on home_products`);
    await queryRunner.query(`
      create trigger home_products_version before insert or update or delete on home_products
        for each row execute function omt_stamp_version('product')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists home_products`);
  }
}

type PurchaseRow = {
  name: string;
  category: string;
  unit: string | null;
  quantity: string | number;
  cost: string | number | null;
  at: Date;
};

type Product = {
  key: string;
  name: string;
  category: string;
  unit: string | null;
  lastCost: string | number | null;
  lastCostQty: string | number | null;
  lastCostUnit: string | null;
  lastCostAt: Date | null;
  lastBoughtAt: Date;
  timesBought: number;
};

/** Rows come newest first: the first row of a name gives its name, category and unit. */
export function summarize(rows: PurchaseRow[]): Product[] {
  const byKey = new Map<string, Product>();
  for (const row of rows) {
    const key = nameKey(row.name);
    if (!key) continue;
    let product = byKey.get(key);
    if (!product) {
      product = {
        key,
        name: row.name.trim(),
        category: row.category,
        unit: row.unit,
        lastCost: null,
        lastCostQty: null,
        lastCostUnit: null,
        lastCostAt: null,
        lastBoughtAt: row.at,
        timesBought: 0,
      };
      byKey.set(key, product);
    }
    product.timesBought += 1;
    if (product.lastCostAt === null && row.cost !== null && row.cost !== undefined) {
      product.lastCost = row.cost;
      product.lastCostQty = row.quantity;
      product.lastCostUnit = row.unit;
      product.lastCostAt = row.at;
    }
  }
  return [...byKey.values()];
}
