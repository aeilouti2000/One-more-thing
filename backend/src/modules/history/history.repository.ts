import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HOME_TZ_SQL } from "../../common/home-time";
import { Item } from "../items/entities/item.entity";
import type { TripCategoryRow } from "./month-summary";

export type Cursor = { at: Date; id: string };

export type TripListRow = {
  id: string;
  name: string | null;
  list_id: string | null;
  list_name: string | null;
  total: string | null;
  started_at: Date;
  last_bought_at: Date;
  item_count: string;
  priced_count: string;
  items_total: string;
  preview: { name: string; category: string; imageId: string | null }[];
};

/** A trip may run past midnight: purchases are looked for this far around a month. */
const TRIP_SPAN = "interval '2 days'";

/**
 * Reads for History. A purchase belongs to the month its trip started in, so
 * a trip is never split between two months (the app's rule). Every query is
 * cut at the plan's window: nothing before `cutoff` is shown.
 */
@Injectable()
export class HistoryRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** Start of the month `month` ("YYYY-MM") and of the next, in the home's time zone, and the plan cutoff. */
  async bounds(homeId: string, month: string | null, historyMonths: number) {
    const [year, mon] = month ? month.split("-").map(Number) : [null, null];
    const rows: { start: Date | null; end: Date | null; cutoff: Date; timezone: string }[] =
      await this.dataSource.query(
        `select case when $2::int is null then null
                     else make_timestamp($2::int, $3::int, 1, 0, 0, 0) at time zone ${HOME_TZ_SQL} end as start,
                case when $2::int is null then null
                     else (make_timestamp($2::int, $3::int, 1, 0, 0, 0) + interval '1 month') at time zone ${HOME_TZ_SQL} end as "end",
                (date_trunc('month', now() at time zone ${HOME_TZ_SQL}) - make_interval(months => $4::int))
                  at time zone ${HOME_TZ_SQL} as cutoff,
                ${HOME_TZ_SQL} as timezone
           from homes h where h.id = $1`,
        [homeId, year, mon, historyMonths],
      );
    return rows[0] ?? null;
  }

  /** One page of a month's purchases, newest first. */
  async purchases(
    homeId: string,
    range: { start: Date; end: Date; cutoff: Date },
    filters: { listId?: string; category?: string },
    cursor: Cursor | null,
    limit: number,
  ) {
    const query = this.dataSource
      .getRepository(Item)
      .createQueryBuilder("item")
      .innerJoin("trip_receipts", "trip", "trip.id = item.receipt_id")
      .where("item.home_id = :homeId and item.status = 'bought'", { homeId })
      .andWhere(`item.bought_at >= cast(:start as timestamptz) - ${TRIP_SPAN}`, { start: range.start })
      .andWhere(`item.bought_at < cast(:end as timestamptz) + ${TRIP_SPAN}`, { end: range.end })
      .andWhere("trip.started_at >= :start and trip.started_at < :end", { start: range.start, end: range.end })
      .andWhere("trip.started_at >= :cutoff", { cutoff: range.cutoff })
      .orderBy("item.bought_at", "DESC")
      .addOrderBy("item.id", "DESC")
      .limit(limit + 1);
    if (filters.listId) query.andWhere("item.list_id = :listId", { listId: filters.listId });
    if (filters.category) query.andWhere("item.category = :category", { category: filters.category });
    if (cursor) {
      query.andWhere("(item.bought_at, item.id) < (cast(:cursorAt as timestamptz), cast(:cursorId as uuid))", {
        cursorAt: cursor.at,
        cursorId: cursor.id,
      });
    }
    return query.getMany();
  }

  /** Purchases whose name contains `text`, in every month the plan keeps. */
  async search(homeId: string, text: string, cutoff: Date, cursor: Cursor | null, limit: number) {
    const pattern = `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const query = this.dataSource
      .getRepository(Item)
      .createQueryBuilder("item")
      .where("item.home_id = :homeId and item.status = 'bought'", { homeId })
      .andWhere("item.bought_at >= :cutoff", { cutoff })
      .andWhere("item.name ilike :pattern", { pattern })
      .orderBy("item.bought_at", "DESC")
      .addOrderBy("item.id", "DESC")
      .limit(limit + 1);
    if (cursor) {
      query.andWhere("(item.bought_at, item.id) < (cast(:cursorAt as timestamptz), cast(:cursorId as uuid))", {
        cursorAt: cursor.at,
        cursorId: cursor.id,
      });
    }
    return query.getMany();
  }

  /** One page of a month's trips, newest first, with their counts and first three items. */
  trips(
    homeId: string,
    range: { start: Date; end: Date; cutoff: Date },
    listId: string | undefined,
    cursor: Cursor | null,
    limit: number,
  ): Promise<TripListRow[]> {
    return this.dataSource.query(
      `select r.id, r.name, r.list_id, l.name as list_name, r.total, r.started_at, r.last_bought_at,
              counts.item_count, counts.priced_count, counts.items_total, preview.items as preview
         from trip_receipts r
         left join lists l on l.id = r.list_id
         cross join lateral (
           select count(*) as item_count, count(i.cost) as priced_count, coalesce(sum(i.cost), 0) as items_total
             from items i where i.receipt_id = r.id and i.status = 'bought'
         ) counts
         cross join lateral (
           select coalesce(json_agg(json_build_object('name', p.name, 'category', p.category, 'imageId', p.image_id)), '[]') as items
             from (select i.name, i.category, i.image_id from items i
                    where i.receipt_id = r.id and i.status = 'bought'
                    order by i.bought_at, i.id limit 3) p
         ) preview
        where r.home_id = $1 and r.started_at >= $2 and r.started_at < $3 and r.started_at >= $4
          and ($5::uuid is null or r.list_id = $5)
          and ($6::timestamptz is null or (r.started_at, r.id) < ($6, $7::uuid))
          and counts.item_count > 0
        order by r.started_at desc, r.id desc
        limit $8`,
      [
        homeId,
        range.start,
        range.end,
        range.cutoff,
        listId ?? null,
        cursor?.at ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );
  }

  async trip(homeId: string, tripId: string) {
    const rows: { id: string; name: string | null; list_id: string | null; list_name: string | null; total: string | null; started_at: Date; last_bought_at: Date }[] =
      await this.dataSource.query(
        `select r.id, r.name, r.list_id, l.name as list_name, r.total, r.started_at, r.last_bought_at
           from trip_receipts r left join lists l on l.id = r.list_id
          where r.id = $1 and r.home_id = $2`,
        [tripId, homeId],
      );
    return rows[0] ?? null;
  }

  tripItems(tripId: string) {
    return this.dataSource.getRepository(Item).find({
      where: { receiptId: tripId, status: "bought" },
      order: { boughtAt: "DESC", id: "DESC" },
    });
  }

  /** A month's purchases grouped by trip and category: the input of summarizeMonth. */
  monthRows(homeId: string, start: Date, end: Date): Promise<TripCategoryRow[]> {
    return this.dataSource.query(
      `select r.id as trip_id, r.total, i.category,
              count(*) as items, count(i.cost) as priced, coalesce(sum(i.cost), 0) as cost_sum
         from trip_receipts r
         join items i on i.receipt_id = r.id and i.status = 'bought'
        where r.home_id = $1 and r.started_at >= $2 and r.started_at < $3
        group by r.id, i.category`,
      [homeId, start, end],
    );
  }

  /** Every trip since `since` with its month (home's time zone) and item totals. */
  tripsByMonth(homeId: string, since: Date | null) {
    return this.dataSource.query(
      `select to_char(r.started_at at time zone ${HOME_TZ_SQL}, 'YYYY-MM') as month, r.total,
              count(i.id) as items, coalesce(sum(i.cost), 0) as items_total
         from trip_receipts r
         join homes h on h.id = r.home_id
         join items i on i.receipt_id = r.id and i.status = 'bought'
        where r.home_id = $1 and ($2::timestamptz is null or r.started_at >= $2)
        group by r.id, h.timezone`,
      [homeId, since],
    ) as Promise<{ month: string; total: string | null; items: string; items_total: string }[]>;
  }

  async archivedMonth(homeId: string, month: string) {
    const rows: { item_count: number; priced_count: number; trip_count: number; spend: string }[] =
      await this.dataSource.query(
        `select item_count, priced_count, trip_count, spend from home_months
          where home_id = $1 and month = to_date($2, 'YYYY-MM')`,
        [homeId, month],
      );
    if (!rows[0]) return null;
    const categories: { category: string; item_count: number; spend: string }[] = await this.dataSource.query(
      `select category, item_count, spend from home_month_categories
        where home_id = $1 and month = to_date($2, 'YYYY-MM') order by spend desc`,
      [homeId, month],
    );
    return { ...rows[0], categories };
  }

  archivedMonths(homeId: string): Promise<{ month: string; item_count: number; spend: string }[]> {
    return this.dataSource.query(
      `select to_char(month, 'YYYY-MM') as month, item_count, spend from home_months where home_id = $1`,
      [homeId],
    );
  }
}
