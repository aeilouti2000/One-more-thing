import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DomainError } from "../../../common/domain.error";
import { User } from "../../../users/user.entity";
import { HomesService } from "../../homes/services/homes.service";
import { ListShopLock } from "../entities/list-shop-lock.entity";
import { LISTS_REPOSITORY, type IListsRepository } from "../repo/lists-repo/lists.repository";

/** Lock expires if the shopper stops heartbeating (crash, force-quit, offline). */
export const SHOP_LOCK_TTL_MS = 45_000;

export type ShopLockView = {
  listId: string;
  active: boolean;
  shopperId: string | null;
  shopperName: string | null;
  isMine: boolean;
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
    await this.homes.requireMembership(userId, homeId);
    await this.requireList(homeId, listId);
    return this.viewFor(userId, homeId, listId);
  }

  async claim(userId: string, homeId: string, listId: string): Promise<ShopLockView> {
    await this.homes.requireMembership(userId, homeId);
    await this.requireList(homeId, listId);

    const household = await this.homes.getOne(userId, homeId);
    if (household.members.length <= 1) {
      return { listId, active: false, shopperId: null, shopperName: null, isMine: false };
    }

    const existing = await this.locks.findOne({ where: { listId } });
    const now = new Date();

    if (existing && !this.isStale(existing, now)) {
      if (existing.userId === userId) {
        existing.heartbeatAt = now;
        await this.locks.save(existing);
        return this.toView(userId, existing, await this.nameOf(userId));
      }
      const name = await this.nameOf(existing.userId);
      throw new DomainError(
        "LIST_SHOPPING_LOCKED",
        `${name} is shopping this list`,
        HttpStatus.CONFLICT,
      );
    }

    if (existing) {
      existing.userId = userId;
      existing.homeId = homeId;
      existing.startedAt = now;
      existing.heartbeatAt = now;
      await this.locks.save(existing);
      return this.toView(userId, existing, await this.nameOf(userId));
    }

    const created = this.locks.create({
      listId,
      homeId,
      userId,
      startedAt: now,
      heartbeatAt: now,
    });
    await this.locks.save(created);
    return this.toView(userId, created, await this.nameOf(userId));
  }

  async heartbeat(userId: string, homeId: string, listId: string): Promise<ShopLockView> {
    await this.homes.requireMembership(userId, homeId);
    await this.requireList(homeId, listId);

    const existing = await this.locks.findOne({ where: { listId, homeId } });
    if (!existing || existing.userId !== userId || this.isStale(existing)) {
      throw new DomainError(
        "SHOP_LOCK_GONE",
        "This shopping trip is no longer locked",
        HttpStatus.CONFLICT,
      );
    }

    existing.heartbeatAt = new Date();
    await this.locks.save(existing);
    return this.toView(userId, existing, await this.nameOf(userId));
  }

  async release(userId: string, homeId: string, listId: string): Promise<{ released: boolean }> {
    await this.homes.requireMembership(userId, homeId);
    const existing = await this.locks.findOne({ where: { listId, homeId } });
    if (!existing) return { released: false };
    if (existing.userId !== userId) return { released: false };
    await this.locks.delete({ listId });
    return { released: true };
  }

  private async viewFor(userId: string, homeId: string, listId: string): Promise<ShopLockView> {
    const existing = await this.locks.findOne({ where: { listId, homeId } });
    if (!existing || this.isStale(existing)) {
      if (existing) await this.locks.delete({ listId });
      return { listId, active: false, shopperId: null, shopperName: null, isMine: false };
    }
    return this.toView(userId, existing, await this.nameOf(existing.userId));
  }

  private toView(viewerId: string, lock: ListShopLock, shopperName: string): ShopLockView {
    return {
      listId: lock.listId,
      active: true,
      shopperId: lock.userId,
      shopperName,
      isMine: lock.userId === viewerId,
    };
  }

  private isStale(lock: ListShopLock, now = new Date()) {
    return now.getTime() - lock.heartbeatAt.getTime() > SHOP_LOCK_TTL_MS;
  }

  private async nameOf(userId: string) {
    const user = await this.users.findOne({ where: { id: userId }, select: { id: true, name: true } });
    return user?.name?.trim() || "Member";
  }

  private async requireList(homeId: string, listId: string) {
    const list = await this.shoppingLists.findActiveById(listId, homeId);
    if (!list) {
      throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);
    }
    return list;
  }
}
