import { Injectable } from "@nestjs/common";
import { In, IsNull, type EntityManager } from "typeorm";
import { Item } from "../entities/item.entity";
import { TripReceipt } from "../entities/trip-receipt.entity";

/** A purchase joins the trip whose last purchase was at most this long before it. */
export const TRIP_GAP_MS = 90 * 60 * 1000;

/**
 * Every purchase belongs to a trip (a row in trip_receipts).
 *
 * The rule is the one the app used to apply when it grouped purchases itself:
 * same list, each bought within 90 minutes of the one before. A trip named or
 * priced by someone is just a trip with a name or a total.
 */
@Injectable()
export class TripsService {
  /**
   * Puts purchases made at `boughtAt` that have no trip yet on the right trip:
   * the newest trip of their list whose last purchase was within 90 minutes,
   * or a new one. Call inside the transaction that marked them bought.
   */
  async attachNewPurchases(manager: EntityManager, homeId: string, itemIds: string[], boughtAt: Date) {
    if (itemIds.length === 0) return;
    const rows = await manager.find(Item, {
      where: { id: In(itemIds), homeId, status: "bought", receiptId: IsNull() },
      select: { id: true, listId: true, boughtAt: true },
    });
    const byList = new Map<string, string[]>();
    for (const row of rows) {
      // Only what this request just bought, never an older purchase sent by a stale phone.
      if (row.boughtAt?.getTime() !== boughtAt.getTime()) continue;
      byList.set(row.listId, [...(byList.get(row.listId) ?? []), row.id]);
    }

    for (const [listId, ids] of byList) {
      // Two people buying from one list at the same moment must land on one trip,
      // not create one each: buyers of the same list take turns here.
      await manager.query("select pg_advisory_xact_lock(hashtext($1))", [`trip:${listId}`]);
      // Within 90 minutes on either side: requests sent at the same moment can
      // reach here in either order, each with its own start time.
      const recent: { id: string }[] = await manager.query(
        `select id from trip_receipts
          where home_id = $1 and list_id = $2
            and last_bought_at >= $3 and started_at <= $4
          order by last_bought_at desc
          limit 1`,
        [homeId, listId, new Date(boughtAt.getTime() - TRIP_GAP_MS), new Date(boughtAt.getTime() + TRIP_GAP_MS)],
      );
      const tripId =
        recent[0]?.id ??
        (
          await manager.save(
            manager.create(TripReceipt, {
              homeId,
              listId,
              total: null,
              name: null,
              createdBy: null,
              startedAt: boughtAt,
              lastBoughtAt: boughtAt,
            }),
          )
        ).id;
      await manager.update(Item, { id: In(ids) }, { receiptId: tripId });
      await this.refreshTimes(manager, [tripId]);
    }
  }

  /** Sets each trip's first and last purchase times from its items. */
  async refreshTimes(manager: EntityManager, tripIds: (string | null | undefined)[]) {
    const ids = [...new Set(tripIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return;
    await manager.query(
      `update trip_receipts r
          set started_at = x.first_at, last_bought_at = x.last_at
         from (select receipt_id, min(bought_at) as first_at, max(bought_at) as last_at
                 from items
                where receipt_id = any($1::uuid[]) and bought_at is not null
                group by receipt_id) x
        where r.id = x.receipt_id
          and (r.started_at, r.last_bought_at) is distinct from (x.first_at, x.last_at)`,
      [ids],
    );
  }
}
