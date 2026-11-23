import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HOME_TZ_SQL } from "../../common/home-time";
import { Item } from "../items/entities/item.entity";

export type HomeSyncState = {
  version: number;
  syncFloor: number;
  /** Start of last month in the home's time zone: purchases before it stay off the phone. */
  windowStart: Date;
  timezone: string | null;
};

export type ProductRow = {
  id: string;
  name: string;
  name_key: string;
  category: string;
  unit: string | null;
  last_cost: string | null;
  last_cost_qty: string | null;
  last_cost_unit: string | null;
  last_cost_at: Date | null;
  last_bought_at: Date;
  times_bought: number;
};

export type TripRow = {
  id: string;
  list_id: string | null;
  name: string | null;
  total: string | null;
  started_at: Date;
  last_bought_at: Date;
};

/** Raw reads for the changes endpoint. Every query is answered from an index. */
@Injectable()
export class SyncRepository {
  constructor(private readonly dataSource: DataSource) {}

  async state(homeId: string): Promise<HomeSyncState | null> {
    const rows: { version: string; sync_floor: string; window_start: Date; timezone: string | null }[] =
      await this.dataSource.query(
        `select h.version, h.sync_floor, h.timezone,
                (date_trunc('month', now() at time zone ${HOME_TZ_SQL}) - interval '1 month')
                  at time zone ${HOME_TZ_SQL} as window_start
           from homes h where h.id = $1`,
        [homeId],
      );
    const row = rows[0];
    if (!row) return null;
    return {
      version: Number(row.version),
      syncFloor: Number(row.sync_floor),
      windowStart: row.window_start,
      timezone: row.timezone,
    };
  }

  async setTimezone(homeId: string, timezone: string) {
    await this.dataSource.query(`update homes set timezone = $2 where id = $1 and timezone is null`, [
      homeId,
      timezone,
    ]);
  }

  /** Needed and parked items, plus purchases inside the window. */
  allItems(homeId: string, windowStart: Date) {
    return this.dataSource
      .getRepository(Item)
      .createQueryBuilder("item")
      .where("item.home_id = :homeId", { homeId })
      .andWhere("(item.status = 'needed' or (item.status = 'bought' and item.bought_at >= :windowStart))", {
        windowStart,
      })
      .orderBy("item.sort_order", "ASC")
      .addOrderBy("item.created_at", "DESC")
      .getMany();
  }

  /** Items changed after `since`, or belonging to a trip that changed (its name or total). */
  async changedItems(homeId: string, since: number, windowStart: Date, tripIds: string[]) {
    const repo = this.dataSource.getRepository(Item);
    const inWindow = "(item.status = 'needed' or item.bought_at >= :windowStart)";
    const changed = await repo
      .createQueryBuilder("item")
      .where("item.home_id = :homeId and item.version > :since", { homeId, since })
      .andWhere(inWindow, { windowStart })
      .getMany();
    if (tripIds.length === 0) return changed;
    const ofTrips = await repo
      .createQueryBuilder("item")
      .where("item.home_id = :homeId and item.receipt_id = any(:tripIds)", { homeId, tripIds })
      .andWhere(inWindow, { windowStart })
      .getMany();
    const byId = new Map(changed.map((item) => [item.id, item]));
    for (const item of ofTrips) byId.set(item.id, item);
    return [...byId.values()];
  }

  products(homeId: string, since: number | null): Promise<ProductRow[]> {
    return this.dataSource.query(
      `select id, name, name_key, category, unit, last_cost, last_cost_qty, last_cost_unit,
              last_cost_at, last_bought_at, times_bought
         from home_products
        where home_id = $1 and ($2::bigint is null or version > $2)`,
      [homeId, since],
    );
  }

  trips(homeId: string, since: number | null, windowStart: Date): Promise<TripRow[]> {
    return this.dataSource.query(
      `select id, list_id, name, total, started_at, last_bought_at
         from trip_receipts
        where home_id = $1 and last_bought_at >= $3 and ($2::bigint is null or version > $2)`,
      [homeId, since, windowStart],
    );
  }

  /** Deletions phones must apply: items, products and trips (the other kinds are sent whole). */
  deletions(homeId: string, since: number): Promise<{ entity: string; entity_id: string }[]> {
    return this.dataSource.query(
      `select entity, entity_id from home_deletions
        where home_id = $1 and version > $2 and entity in ('item', 'product', 'trip')
        order by version`,
      [homeId, since],
    );
  }
}
