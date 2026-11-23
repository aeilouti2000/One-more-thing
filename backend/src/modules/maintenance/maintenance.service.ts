import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { HOME_TZ_SQL } from "../../common/home-time";
import { STORAGE, type Storage } from "../../common/storage/storage";
import { summarizeMonth, type TripCategoryRow } from "../history/month-summary";
import { planOf } from "../plans/plans";

/** After a plan change, nothing is deleted for this long: a renewed plan gets its history back. */
export const GRACE_DAYS = 30;
/** Deletion markers older than this are removed; a phone further behind gets a full copy. */
export const MARKER_DAYS = 60;
const HOMES_PER_BATCH = 500;
const DELETE_BATCH = 1000;

export type MaintenanceResult = {
  homes: number;
  monthsCleaned: number;
  itemsDeleted: number;
  /** Where to continue (call again with `after`), or null when every home was seen. */
  next: string | null;
};

/**
 * The daily clean-up.
 *
 * For each home, every month older than its plan keeps is cleaned: the month's
 * totals are saved (home_months), then its purchases, their photos and its
 * trips are deleted. Products are never cleaned, so suggestions and last
 * prices survive. Phones never hold those months (they keep two), so the
 * deletions are not sent to them (omt.skip_sync).
 *
 * Work is cut into batches of homes; the caller passes `after` to continue, so
 * no single request runs long.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(STORAGE) private readonly storage: Storage | null,
  ) {}

  async run(after: string | null, budgetMs = 20_000): Promise<MaintenanceResult> {
    const started = Date.now();
    if (!after) await this.housekeeping();

    const result: MaintenanceResult = { homes: 0, monthsCleaned: 0, itemsDeleted: 0, next: null };
    let cursor = after;
    while (Date.now() - started < budgetMs) {
      const homes: { id: string; plan: string; plan_until: Date | null; plan_changed_at: Date }[] =
        await this.dataSource.query(
          `select id, plan, plan_until, plan_changed_at from homes
            where ($1::uuid is null or id > $1) order by id limit $2`,
          [cursor, HOMES_PER_BATCH],
        );
      if (homes.length === 0) return result;
      for (const home of homes) {
        cursor = home.id;
        result.homes += 1;
        const cleaned = await this.cleanHome(home);
        result.monthsCleaned += cleaned.months;
        result.itemsDeleted += cleaned.items;
        if (Date.now() - started >= budgetMs) {
          result.next = cursor;
          return result;
        }
      }
      if (homes.length < HOMES_PER_BATCH) return result;
    }
    result.next = cursor;
    return result;
  }

  /** Cleans the months a home's plan no longer keeps. */
  async cleanHome(home: { id: string; plan: string; plan_until: Date | null; plan_changed_at: Date }) {
    const done = { months: 0, items: 0 };
    if (Date.now() - home.plan_changed_at.getTime() < GRACE_DAYS * 86_400_000) return done;
    const { historyMonths } = planOf({ plan: home.plan, planUntil: home.plan_until }).limits;

    const months: { month: string; start: Date; end: Date }[] = await this.dataSource.query(
      `with bounds as (
         select ${HOME_TZ_SQL} as tz,
                (date_trunc('month', now() at time zone ${HOME_TZ_SQL}) - make_interval(months => $2::int))
                  at time zone ${HOME_TZ_SQL} as cutoff
           from homes h where h.id = $1
       ),
       old as (
         select distinct date_trunc('month', r.started_at at time zone b.tz) as local_month, b.tz
           from trip_receipts r, bounds b
          where r.home_id = $1 and r.started_at < b.cutoff
       )
       select to_char(local_month, 'YYYY-MM') as month,
              local_month at time zone tz as start,
              (local_month + interval '1 month') at time zone tz as "end"
         from old order by local_month`,
      [home.id, historyMonths],
    );

    for (const month of months) {
      const deleted = await this.dataSource.transaction(async (manager) => {
        await manager.query(`set local omt.skip_sync = 'on'`);
        await this.saveTotals(manager, home.id, month);
        let total = 0;
        for (;;) {
          const batch: { id: string }[] = await manager.query(
            `delete from items where id in (
               select i.id from items i join trip_receipts r on r.id = i.receipt_id
                where r.home_id = $1 and r.started_at >= $2 and r.started_at < $3
                limit ${DELETE_BATCH}
             ) returning id`,
            [home.id, month.start, month.end],
          );
          const count = Array.isArray(batch[0]) ? (batch[0] as unknown[]).length : batch.length;
          total += count;
          if (count < DELETE_BATCH) break;
        }
        await manager.query(
          `delete from trip_receipts r
            where r.home_id = $1 and r.started_at >= $2 and r.started_at < $3
              and not exists (select 1 from items i where i.receipt_id = r.id)`,
          [home.id, month.start, month.end],
        );
        return total;
      });
      done.months += 1;
      done.items += deleted;
    }
    if (done.months > 0) {
      this.logger.log(`Cleaned ${done.months} month(s), ${done.items} purchase(s) of a home`);
    }
    return done;
  }

  /** Saves a month's totals once; a month already saved keeps its first totals. */
  private async saveTotals(manager: EntityManager, homeId: string, month: { month: string; start: Date; end: Date }) {
    const rows: TripCategoryRow[] = await manager.query(
      `select r.id as trip_id, r.total, i.category,
              count(*) as items, count(i.cost) as priced, coalesce(sum(i.cost), 0) as cost_sum
         from trip_receipts r
         join items i on i.receipt_id = r.id and i.status = 'bought'
        where r.home_id = $1 and r.started_at >= $2 and r.started_at < $3
        group by r.id, i.category`,
      [homeId, month.start, month.end],
    );
    const summary = summarizeMonth(rows);
    if (summary.itemCount === 0) return;
    const inserted: { home_id: string }[] = await manager.query(
      `insert into home_months (home_id, month, item_count, priced_count, trip_count, spend)
       values ($1, to_date($2, 'YYYY-MM'), $3, $4, $5, $6)
       on conflict (home_id, month) do nothing
       returning home_id`,
      [homeId, month.month, summary.itemCount, summary.pricedCount, summary.tripCount, summary.spend],
    );
    const wasInserted = Array.isArray(inserted[0]) ? (inserted[0] as unknown[]).length > 0 : inserted.length > 0;
    if (!wasInserted) return;
    for (const category of summary.categories) {
      await manager.query(
        `insert into home_month_categories (home_id, month, category, item_count, spend)
         values ($1, to_date($2, 'YYYY-MM'), $3, $4, $5)
         on conflict do nothing`,
        [homeId, month.month, category.category, category.itemCount, category.spend],
      );
    }
  }

  /** Deletes the files of deleted photos and icons (recorded by triggers in storage_trash). */
  async emptyStorageTrash() {
    if (!this.storage) return 0;
    let removed = 0;
    for (;;) {
      const rows: { key: string }[] = await this.dataSource.query(
        `select key from storage_trash order by created_at limit 1000`,
      );
      if (rows.length === 0) return removed;
      const keys = rows.map((row) => row.key);
      await this.storage.delete(keys);
      await this.dataSource.query(`delete from storage_trash where key = any($1::text[])`, [keys]);
      removed += keys.length;
      if (rows.length < 1000) return removed;
    }
  }

  /** Once per run: old deletion markers, emptied storage, expired sign-in tokens, codes and finished questions. */
  private async housekeeping() {
    await this.dataSource.transaction(async (manager) => {
      // Phones that synced before the oldest marker kept are sent a full copy (sync_floor).
      await manager.query(
        `with removed as (
           delete from home_deletions where deleted_at < now() - make_interval(days => $1)
           returning home_id, version
         ),
         floors as (select home_id, max(version) as version from removed group by home_id)
         update homes h set sync_floor = greatest(h.sync_floor, f.version)
           from floors f where h.id = f.home_id`,
        [MARKER_DAYS],
      );
    });
    await this.emptyStorageTrash();
    await this.dataSource.query(`delete from refresh_tokens where expires_at < now() - interval '1 day'`);
    await this.dataSource.query(`delete from email_codes where expires_at < now() - interval '1 day'`);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`set local omt.skip_sync = 'on'`);
      await manager.query(`delete from shop_asks where expires_at < now() - interval '1 day'`);
    });
  }
}
