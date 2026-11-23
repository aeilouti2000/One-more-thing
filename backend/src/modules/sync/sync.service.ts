import { HttpStatus, Injectable } from "@nestjs/common";
import { DomainError } from "../../common/domain.error";
import { isValidTimezone } from "../../common/home-time";
import { HomesService } from "../homes/services/homes.service";
import { IconsService } from "../icons/icons.service";
import { CategoriesService } from "../items/services/categories.service";
import { ItemsService } from "../items/services/items.service";
import { PinsService } from "../items/services/pins.service";
import { SetsService } from "../items/services/sets.service";
import { ShopAsksService } from "../items/services/shop-asks.service";
import { ShopLocksService } from "../items/services/shop-locks.service";
import { type ProductRow, SyncRepository, type TripRow } from "./sync.repository";

/**
 * "What changed in this home since version N?"
 *
 * - Nothing changed: answered after reading one row.
 * - The phone is too far behind (or new): a full copy.
 * - Otherwise: only the rows stamped after N, plus deletions.
 *
 * Items, products and trips can grow large, so only their changes are sent.
 * The rest (home and members, lists, categories, icons, pins, sets, asks, shop locks)
 * is small and sent whole whenever anything changed.
 *
 * The version is read before the rows. Changes to one home commit one after
 * another (they all update the home's row), so every row with a number up to
 * the version read is already visible; a row with a higher number may be sent
 * early and simply comes again next time.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly repo: SyncRepository,
    private readonly homes: HomesService,
    private readonly items: ItemsService,
    private readonly categories: CategoriesService,
    private readonly pins: PinsService,
    private readonly sets: SetsService,
    private readonly asks: ShopAsksService,
    private readonly locks: ShopLocksService,
    private readonly icons: IconsService,
  ) {}

  async changes(userId: string, homeId: string, since: number | null, timezone?: string) {
    await this.homes.requireMembership(userId, homeId);
    await this.locks.removeExpired(homeId);

    let state = await this.repo.state(homeId);
    if (!state) throw new DomainError("HOME_NOT_FOUND", "Home not found", HttpStatus.NOT_FOUND);
    if (state.timezone === null && isValidTimezone(timezone)) {
      await this.repo.setTimezone(homeId, timezone);
      state = (await this.repo.state(homeId)) ?? state;
    }

    if (since !== null && since === state.version) {
      return { version: state.version, full: false as const };
    }
    const full = since === null || since > state.version || since < state.syncFloor;
    const after = full ? null : since;

    const [trips, products] = await Promise.all([
      this.repo.trips(homeId, after, state.windowStart),
      this.repo.products(homeId, after),
    ]);
    const itemRows = full
      ? await this.repo.allItems(homeId, state.windowStart)
      : await this.repo.changedItems(
          homeId,
          since as number,
          state.windowStart,
          trips.map((trip) => trip.id),
        );
    const deleted = full ? [] : await this.repo.deletions(homeId, since as number);

    const home = await this.homes.getOne(userId, homeId);
    const [items, lists, categories, pins, sets, asks, locks, icons] = await Promise.all([
      this.items.withNames(itemRows),
      this.items.lists(userId, homeId),
      this.categories.list(userId, homeId),
      this.pins.list(userId, homeId),
      this.sets.list(userId, homeId),
      this.asks.active(userId, homeId),
      this.locks.homeLocks(userId, homeId, home.tripShopTogether === true),
      this.icons.forHome(homeId),
    ]);

    return {
      version: state.version,
      full,
      windowStart: state.windowStart,
      home,
      lists,
      categories,
      pins,
      sets,
      asks,
      locks,
      icons,
      items,
      products: products.map(toProduct),
      trips: trips.map(toTrip),
      deleted: deleted.map((row) => ({ type: row.entity, id: row.entity_id })),
    };
  }
}

const money = (value: string | null) => (value === null ? null : Number(value));

function toProduct(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    category: row.category,
    unit: row.unit,
    lastCost: money(row.last_cost),
    lastCostQuantity: money(row.last_cost_qty),
    lastCostUnit: row.last_cost_unit,
    lastCostAt: row.last_cost_at,
    lastBoughtAt: row.last_bought_at,
    timesBought: row.times_bought,
  };
}

function toTrip(row: TripRow) {
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    total: money(row.total),
    startedAt: row.started_at,
    lastBoughtAt: row.last_bought_at,
  };
}
