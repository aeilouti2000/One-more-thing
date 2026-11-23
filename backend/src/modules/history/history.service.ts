import { HttpStatus, Injectable } from "@nestjs/common";
import { DomainError } from "../../common/domain.error";
import { HomesService } from "../homes/services/homes.service";
import type { Item } from "../items/entities/item.entity";
import { ItemsService } from "../items/services/items.service";
import { type Cursor, HistoryRepository, type TripListRow } from "./history.repository";
import { summarizeMonth } from "./month-summary";

const money = (value: string | number | null) => (value === null ? null : Number(value));

/**
 * History, one page at a time, cut at the home plan's window. Pages are read
 * by cursor ("older than this row"), so page 50 costs what page 1 costs and a
 * purchase made while someone scrolls never shifts the rows.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly repo: HistoryRepository,
    private readonly homes: HomesService,
    private readonly items: ItemsService,
  ) {}

  async purchases(
    userId: string,
    homeId: string,
    query: { month?: string; listId?: string; category?: string; q?: string; before?: string; limit?: number },
  ) {
    const { bounds } = await this.access(userId, homeId, query.month ?? null);
    const limit = query.limit ?? 30;
    const cursor = parseCursor(query.before);
    let rows: Item[];
    if (query.q) {
      rows = await this.repo.search(homeId, query.q.trim(), bounds.cutoff, cursor, limit);
    } else {
      if (!bounds.start || !bounds.end) {
        throw new DomainError("MONTH_REQUIRED", "Choose a month.", HttpStatus.BAD_REQUEST);
      }
      rows = await this.repo.purchases(
        homeId,
        { start: bounds.start, end: bounds.end, cutoff: bounds.cutoff },
        { listId: query.listId, category: query.category },
        cursor,
        limit,
      );
    }
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: await this.items.withNames(page),
      next: rows.length > limit && last?.boughtAt ? formatCursor({ at: last.boughtAt, id: last.id }) : null,
    };
  }

  async trips(userId: string, homeId: string, query: { month: string; listId?: string; before?: string; limit?: number }) {
    const { bounds } = await this.access(userId, homeId, query.month);
    const limit = query.limit ?? 20;
    const rows = await this.repo.trips(
      homeId,
      { start: bounds.start as Date, end: bounds.end as Date, cutoff: bounds.cutoff },
      query.listId,
      parseCursor(query.before),
      limit,
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      trips: page.map(toTrip),
      next: rows.length > limit && last ? formatCursor({ at: last.started_at, id: last.id }) : null,
    };
  }

  async trip(userId: string, homeId: string, tripId: string) {
    const { bounds } = await this.access(userId, homeId, null);
    const trip = await this.repo.trip(homeId, tripId);
    if (!trip || trip.started_at < bounds.cutoff) {
      throw new DomainError("RECEIPT_NOT_FOUND", "Trip not found", HttpStatus.NOT_FOUND);
    }
    const items = await this.repo.tripItems(tripId);
    return {
      trip: {
        id: trip.id,
        name: trip.name,
        listId: trip.list_id,
        listName: trip.list_name,
        total: money(trip.total),
        startedAt: trip.started_at,
        lastBoughtAt: trip.last_bought_at,
      },
      items: await this.items.withNames(items),
    };
  }

  /**
   * A month's totals. Months the plan still keeps are summed from purchases;
   * older months come from the totals saved when they were cleaned (or are
   * summed, while their purchases are still within the grace period).
   */
  async month(userId: string, homeId: string, month: string) {
    const { bounds, household } = await this.access(userId, homeId, month);
    const start = bounds.start as Date;
    const budget = household.monthlyBudget ?? null;
    if (start < bounds.cutoff) {
      const archived = await this.repo.archivedMonth(homeId, month);
      if (archived) {
        return {
          month,
          state: "archived" as const,
          itemCount: archived.item_count,
          pricedCount: archived.priced_count,
          tripCount: archived.trip_count,
          spend: Number(archived.spend),
          categories: archived.categories.map((row) => ({
            category: row.category,
            itemCount: row.item_count,
            spend: Number(row.spend),
          })),
          budget,
        };
      }
    }
    const summary = summarizeMonth(await this.repo.monthRows(homeId, start, bounds.end as Date));
    const state = summary.itemCount === 0 ? "none" : start < bounds.cutoff ? "archived" : "live";
    return { month, state, ...summary, budget };
  }

  /** Every month with purchases or saved totals, newest first. */
  async months(userId: string, homeId: string) {
    const { bounds } = await this.access(userId, homeId, null);
    const live = new Map<string, { spend: number; itemCount: number }>();
    for (const row of await this.repo.tripsByMonth(homeId, null)) {
      const entry = live.get(row.month) ?? { spend: 0, itemCount: 0 };
      entry.spend += row.total !== null ? Number(row.total) : Number(row.items_total);
      entry.itemCount += Number(row.items);
      live.set(row.month, entry);
    }
    const cutoffMonth = monthKeyIn(bounds.cutoff, bounds.timezone);
    const result = new Map<string, { month: string; state: "live" | "archived"; spend: number; itemCount: number }>();
    for (const row of await this.repo.archivedMonths(homeId)) {
      result.set(row.month, { month: row.month, state: "archived", spend: Number(row.spend), itemCount: row.item_count });
    }
    for (const [month, entry] of live) {
      if (result.has(month)) continue;
      result.set(month, {
        month,
        state: month < cutoffMonth ? "archived" : "live",
        spend: Math.round(entry.spend * 1000) / 1000,
        itemCount: entry.itemCount,
      });
    }
    return { months: [...result.values()].sort((a, b) => b.month.localeCompare(a.month)) };
  }

  private async access(userId: string, homeId: string, month: string | null) {
    const household = await this.homes.getOne(userId, homeId);
    const bounds = await this.repo.bounds(homeId, month, household.plan.limits.historyMonths);
    if (!bounds) throw new DomainError("HOME_NOT_FOUND", "Home not found", HttpStatus.NOT_FOUND);
    return { household, bounds };
  }
}

function toTrip(row: TripListRow) {
  const total = money(row.total);
  const itemCount = Number(row.item_count);
  return {
    id: row.id,
    name: row.name,
    listId: row.list_id,
    listName: row.list_name,
    startedAt: row.started_at,
    lastBoughtAt: row.last_bought_at,
    total: total ?? Number(row.items_total),
    hasTotal: total !== null,
    itemCount,
    pricedCount: total !== null ? itemCount : Number(row.priced_count),
    itemsTotal: Number(row.items_total),
    preview: row.preview,
  };
}

export function formatCursor(cursor: Cursor) {
  return `${cursor.at.toISOString()}_${cursor.id}`;
}

export function parseCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  const split = value.lastIndexOf("_");
  const at = new Date(value.slice(0, split));
  if (Number.isNaN(at.getTime())) {
    throw new DomainError("INVALID_CURSOR", "That page is not valid.", HttpStatus.BAD_REQUEST);
  }
  return { at, id: value.slice(split + 1) };
}

/** "YYYY-MM" of a moment in a time zone. */
export function monthKeyIn(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" })
    .formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}
