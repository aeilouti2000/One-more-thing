import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { Item } from "../entities/item.entity";
import { nameKey } from "../utils/name-key";

/** The name key computed in SQL, for matching purchases to a product (see utils/name-key.ts). */
const SQL_NAME_KEY = `regexp_replace(regexp_replace(lower(btrim(i.name)), '[\\u064B-\\u0652\\u0640]', '', 'g'), '\\s+', ' ', 'g')`;

/**
 * Keeps home_products in step with purchases: one row per home and item name,
 * with its last name, category, unit and price, when it was last bought, and
 * how often. Name suggestions and last prices read this table.
 *
 * Every method runs inside the caller's transaction.
 */
@Injectable()
export class ProductsService {
  /** Purchases just made. Two purchases of one name in one tap count twice, in one write. */
  async recordPurchases(manager: EntityManager, homeId: string, items: Item[]) {
    const byKey = new Map<string, { item: Item; count: number; priced: Item | null }>();
    for (const item of items) {
      const key = nameKey(item.name);
      if (!key) continue;
      const entry = byKey.get(key) ?? { item, count: 0, priced: null };
      entry.count += 1;
      entry.item = item;
      if (item.cost !== null && item.cost !== undefined) entry.priced = item;
      byKey.set(key, entry);
    }
    if (byKey.size === 0) return;

    const params: unknown[] = [homeId];
    const values = [...byKey].map(([key, { item, count, priced }]) => {
      const at = item.boughtAt ?? new Date();
      const base = params.length;
      params.push(
        key,
        item.name.trim(),
        item.category,
        item.unit,
        priced ? priced.cost : null,
        priced ? priced.quantity : null,
        priced ? priced.unit : null,
        priced ? (priced.boughtAt ?? at) : null,
        at,
        count,
      );
      const p = (n: number) => `$${base + n}`;
      return `($1, ${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}::numeric, ${p(6)}::numeric, ${p(7)}, ${p(8)}::timestamptz, ${p(9)}::timestamptz, ${p(10)}::int)`;
    });
    await manager.query(
      `insert into home_products as p
         (home_id, name_key, name, category, unit, last_cost, last_cost_qty, last_cost_unit,
          last_cost_at, last_bought_at, times_bought)
       values ${values.join(", ")}
       on conflict (home_id, name_key) do update set
         name           = excluded.name,
         category       = excluded.category,
         unit           = excluded.unit,
         last_bought_at = greatest(p.last_bought_at, excluded.last_bought_at),
         times_bought   = p.times_bought + excluded.times_bought,
         last_cost      = coalesce(excluded.last_cost, p.last_cost),
         last_cost_qty  = case when excluded.last_cost is null then p.last_cost_qty else excluded.last_cost_qty end,
         last_cost_unit = case when excluded.last_cost is null then p.last_cost_unit else excluded.last_cost_unit end,
         last_cost_at   = coalesce(excluded.last_cost_at, p.last_cost_at)`,
      params,
    );
  }

  /**
   * A purchase taken back (moved to needed again). Its count goes; a product
   * bought only that once goes; otherwise its "last" facts come from the newest
   * purchase left.
   */
  async purchaseUndone(manager: EntityManager, homeId: string, name: string) {
    const key = nameKey(name);
    if (!key) return;
    // Wrapped in a select: TypeORM returns an update's rows in a different shape.
    const rows: { times_bought: number }[] = await manager.query(
      `with changed as (
         update home_products set times_bought = times_bought - 1
          where home_id = $1 and name_key = $2
          returning times_bought
       )
       select times_bought from changed`,
      [homeId, key],
    );
    if (!rows[0]) return;
    if (rows[0].times_bought <= 0) {
      await manager.query(`delete from home_products where home_id = $1 and name_key = $2`, [homeId, key]);
      return;
    }
    await this.refresh(manager, homeId, key);
  }

  /** A purchase's price changed: its product's last price may have too. */
  async priceChanged(manager: EntityManager, homeId: string, name: string) {
    const key = nameKey(name);
    if (key) await this.refresh(manager, homeId, key);
  }

  /** Recomputes a product's last purchase and last price from the purchases still kept. */
  private async refresh(manager: EntityManager, homeId: string, key: string) {
    await manager.query(
      `update home_products p set
          last_bought_at = coalesce(newest.at, p.last_bought_at),
          name           = coalesce(newest.name, p.name),
          category       = coalesce(newest.category, p.category),
          unit           = case when newest.at is null then p.unit else newest.unit end,
          last_cost      = priced.cost,
          last_cost_qty  = priced.quantity,
          last_cost_unit = priced.unit,
          last_cost_at   = priced.at
        from (select 1) one
        left join lateral (
          select btrim(i.name) as name, i.category, i.unit, coalesce(i.bought_at, i.created_at) as at
            from items i
           where i.home_id = $1 and i.status = 'bought' and ${SQL_NAME_KEY} = $2
           order by coalesce(i.bought_at, i.created_at) desc, i.id desc
           limit 1
        ) newest on true
        left join lateral (
          select i.cost, i.quantity, i.unit, coalesce(i.bought_at, i.created_at) as at
            from items i
           where i.home_id = $1 and i.status = 'bought' and i.cost is not null and ${SQL_NAME_KEY} = $2
           order by coalesce(i.bought_at, i.created_at) desc, i.id desc
           limit 1
        ) priced on true
       where p.home_id = $1 and p.name_key = $2`,
      [homeId, key],
    );
  }
}
