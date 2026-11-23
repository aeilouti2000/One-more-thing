import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThan, Repository, type EntityManager } from "typeorm";
import { DomainError } from "../../../common/domain.error";
import { User } from "../../../users/user.entity";
import { HomesService } from "../../homes/services/homes.service";
import { ListShopLock } from "../entities/list-shop-lock.entity";
import { LISTS_REPOSITORY, type IListsRepository } from "../repo/lists-repo/lists.repository";

/** Lock expires if the shopper stops heartbeating (crash, force-quit, offline). */
export const SHOP_LOCK_TTL_MS = 45_000;

export type ShopLockView = {
  listId: string;
  /** Someone is shopping this list right now. */
  active: boolean;
  /** Another shopper when there is one, otherwise the viewer. */
  shopperId: string | null;
  shopperName: string | null;
  /** The viewer is one of the shoppers. */
  isMine: boolean;
  /** The home lets several people shop one list at the same time. */
  together: boolean;
  /** Everyone shopping this list now, first one first. */
  shoppers: { id: string; name: string }[];
};

@Injectable()
export class ShopLocksService {
  constructor(
    @InjectRepository(ListShopLock) private readonly locks: Repository<ListShopLock>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(LISTS_REPOSITORY) private readonly shoppingLists: IListsRepository,
    private readonly homes: HomesService,
  ) {}

  async status(userId: string, homeId: string, listId: string): Promise<ShopLockView> {
    const home = await this.homes.getOne(userId, homeId);
    await this.requireList(homeId, listId);
    const together = home.tripShopTogether === true;
    await this.locks.delete({ listId, heartbeatAt: LessThan(this.cutoff()) });
    const rows = await this.locks.find({ where: { listId, homeId }, order: { startedAt: "ASC" } });
    return this.toView(userId, listId, rows, together);
  }

  /**
   * Start (or keep) shopping a list. newTrip: a fresh trip, not one coming
   * back after the app closed; earlier "not found" marks on the list are
   * cleared, unless someone else is shopping it right now.
   */
  async claim(
    userId: string,
    homeId: string,
    listId: string,
    options?: { newTrip?: boolean },
  ): Promise<ShopLockView> {
    const home = await this.homes.getOne(userId, homeId);
    await this.requireList(homeId, listId);
    const together = home.tripShopTogether === true;
    const solo = home.members.length <= 1;

    return this.locks.manager.transaction(async (manager) => {
      // One claim per list at a time, so two people can't both take a free list.
      await manager.query("select pg_advisory_xact_lock(hashtext($1))", [`shop-lock:${listId}`]);
      const now = new Date();
      await manager.delete(ListShopLock, { listId, heartbeatAt: LessThan(this.cutoff(now)) });
      const rows = await manager.find(ListShopLock, {
        where: { listId, homeId },
        order: { startedAt: "ASC" },
      });
      const mine = rows.find((row) => row.userId === userId);
      const others = rows.filter((row) => row.userId !== userId);

      if (options?.newTrip && others.length === 0) {
        await this.clearNotFound(manager, homeId, listId);
      }

      if (solo) return this.toView(userId, listId, [], together);

      if (!mine && others.length > 0 && !together) {
        const name = await this.nameOf(others[0].userId);
        throw new DomainError(
          "LIST_SHOPPING_LOCKED",
          `${name} is shopping this list`,
          HttpStatus.CONFLICT,
        );
      }

      if (mine) {
        mine.heartbeatAt = now;
        await manager.save(mine);
      } else {
        const created = manager.create(ListShopLock, {
          listId,
          homeId,
          userId,
          startedAt: now,
          heartbeatAt: now,
        });
        await manager.save(created);
        rows.push(created);
      }
      return this.toView(userId, listId, rows, together);
    });
  }

  /**
   * Who is shopping each list of the home right now, for the changes answer.
   * Expired locks are removed first: a lock ends by time, not by a write, and
   * removing it is what moves the home's change counter so phones notice.
   */
  async removeExpired(homeId: string) {
    await this.locks.delete({ homeId, heartbeatAt: LessThan(this.cutoff()) });
  }

  async homeLocks(viewerId: string, homeId: string, together: boolean): Promise<ShopLockView[]> {
    const rows = await this.locks.find({ where: { homeId }, order: { startedAt: "ASC" } });
    const byList = new Map<string, ListShopLock[]>();
    for (const row of rows) {
      if (this.isStale(row)) continue;
      byList.set(row.listId, [...(byList.get(row.listId) ?? []), row]);
    }
    return Promise.all(
      [...byList].map(([listId, listRows]) => this.toView(viewerId, listId, listRows, together)),
    );
  }

  async heartbeat(userId: string, homeId: string, listId: string): Promise<ShopLockView> {
    const home = await this.homes.getOne(userId, homeId);
    await this.requireList(homeId, listId);
    const mine = await this.locks.findOne({ where: { listId, homeId, userId } });
    if (!mine || this.isStale(mine)) {
      throw new DomainError(
        "SHOP_LOCK_GONE",
        "This shopping trip is no longer locked",
        HttpStatus.CONFLICT,
      );
    }
    mine.heartbeatAt = new Date();
    await this.locks.save(mine);
    const rows = await this.locks.find({ where: { listId, homeId }, order: { startedAt: "ASC" } });
    const live = rows.filter((row) => !this.isStale(row));
    return this.toView(userId, listId, live, home.tripShopTogether === true);
  }

  async release(userId: string, homeId: string, listId: string): Promise<{ released: boolean }> {
    await this.homes.requireMembership(userId, homeId);
    const result = await this.locks.delete({ listId, homeId, userId });
    return { released: (result.affected ?? 0) > 0 };
  }

  private async clearNotFound(manager: EntityManager, homeId: string, listId: string) {
    await manager.query(
      `update items
          set not_found_at = null, not_found_by = null
        where home_id = $1 and list_id = $2
          and status = 'needed' and not_found_at is not null`,
      [homeId, listId],
    );
  }

  private async toView(
    viewerId: string,
    listId: string,
    rows: ListShopLock[],
    together: boolean,
  ): Promise<ShopLockView> {
    if (rows.length === 0) {
      return {
        listId,
        active: false,
        shopperId: null,
        shopperName: null,
        isMine: false,
        together,
        shoppers: [],
      };
    }
    const names = await this.namesOf(rows.map((row) => row.userId));
    const shoppers = rows.map((row) => ({ id: row.userId, name: names.get(row.userId) ?? "Member" }));
    const shown = shoppers.find((shopper) => shopper.id !== viewerId) ?? shoppers[0];
    return {
      listId,
      active: true,
      shopperId: shown.id,
      shopperName: shown.name,
      isMine: shoppers.some((shopper) => shopper.id === viewerId),
      together,
      shoppers,
    };
  }

  private cutoff(now = new Date()) {
    return new Date(now.getTime() - SHOP_LOCK_TTL_MS);
  }

  private isStale(lock: ListShopLock, now = new Date()) {
    return now.getTime() - lock.heartbeatAt.getTime() > SHOP_LOCK_TTL_MS;
  }

  private async nameOf(userId: string) {
    return (await this.namesOf([userId])).get(userId) ?? "Member";
  }

  private async namesOf(userIds: string[]) {
    const ids = [...new Set(userIds)];
    const users = ids.length
      ? await this.users.find({ where: { id: In(ids) }, select: { id: true, name: true } })
      : [];
    return new Map(users.map((user) => [user.id, user.name?.trim() || "Member"]));
  }

  private async requireList(homeId: string, listId: string) {
    const list = await this.shoppingLists.findActiveById(listId, homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    return list;
  }
}
