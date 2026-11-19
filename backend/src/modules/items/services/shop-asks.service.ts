import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, MoreThan, Repository } from "typeorm";
import { DomainError } from "../../../common/domain.error";
import { HomesService } from "../../homes/services/homes.service";
import { NotificationsService } from "../../notifications/services/notifications.service";
import {
  SHOP_ASK_COOLDOWN_MS,
  SHOP_ASK_TTL_MS,
  ShopAsk,
  type ShopAskReply,
} from "../entities/shop-ask.entity";
import { ITEMS_REPOSITORY, type IItemsRepository } from "../repo/items-repo/items.repository";
import { LISTS_REPOSITORY, type IListsRepository } from "../repo/lists-repo/lists.repository";
import { CategoriesService } from "./categories.service";
import { ItemsService } from "./items.service";

/** Open questions shown for one home; more than a couple never happens. */
const ACTIVE_LIMIT = 5;

export type ShopAskView = {
  id: string;
  homeId: string;
  listId: string;
  askedBy: string;
  askedByName: string;
  createdAt: Date;
  expiresAt: Date;
  /** The viewer is the one who asked. */
  mine: boolean;
  /** The viewer's own answer, when they are not the asker. */
  myReply: ShopAskReply | null;
  /** Items the viewer added to the list since the question. */
  myAdded: number;
  /** Everyone who was asked, in the home's member order. */
  replies: { userId: string; name: string; reply: ShopAskReply | null; added: number }[];
};

type Member = { id: string; name: string };

/**
 * "Anything missing?": a shopper asks the rest of the home during a trip.
 * Each person answers "nothing" or adds items; the shopper sees who did what.
 */
@Injectable()
export class ShopAsksService {
  constructor(
    @InjectRepository(ShopAsk) private readonly asks: Repository<ShopAsk>,
    @Inject(ITEMS_REPOSITORY) private readonly itemsRepo: IItemsRepository,
    @Inject(LISTS_REPOSITORY) private readonly lists: IListsRepository,
    private readonly homes: HomesService,
    private readonly items: ItemsService,
    private readonly categories: CategoriesService,
    private readonly notifications: NotificationsService,
  ) {}

  async ask(userId: string, homeId: string, listId: string): Promise<ShopAskView> {
    const home = await this.homes.getOne(userId, homeId);
    if (home.tripAskHome === false) {
      throw new DomainError(
        "SHOP_ASK_OFF",
        "Asking the home is turned off for this home.",
        HttpStatus.FORBIDDEN,
      );
    }
    if (home.members.length <= 1) {
      throw new DomainError(
        "SHOP_ASK_ALONE",
        "There is nobody else in this home to ask.",
        HttpStatus.CONFLICT,
      );
    }
    const list = await this.lists.findActiveById(listId, homeId);
    if (!list) throw new DomainError("LIST_NOT_FOUND", "List not found", HttpStatus.NOT_FOUND);

    const actorName = firstName(home.members.find((member) => member.id === userId)?.name ?? "");

    // One ask per shopper and list at a time: a double tap, or a second phone,
    // must not create two questions. The lock is held until this block ends.
    const { ask, notify } = await this.asks.manager.transaction(async (manager) => {
      await manager.query("select pg_advisory_xact_lock(hashtext($1))", [
        `shop-ask:${listId}:${userId}`,
      ]);
      const now = new Date();
      const cooldownStart = new Date(now.getTime() - SHOP_ASK_COOLDOWN_MS);
      // Old questions go as new ones arrive, so the table stays a few rows
      // long. One that ended a moment ago is kept: it still holds the cooldown.
      await this.asks.delete({
        homeId,
        expiresAt: LessThan(now),
        createdAt: LessThan(cooldownStart),
      });

      const latest = await this.asks.findOne({
        where: { homeId, listId, askedBy: userId },
        order: { createdAt: "DESC" },
      });
      // Still open: asking again shows the same question, and notifies nobody.
      if (latest && latest.expiresAt.getTime() > now.getTime()) {
        return { ask: latest, notify: false };
      }
      const saved = await this.asks.save(
        this.asks.create({
          homeId,
          listId,
          askedBy: userId,
          replies: {},
          expiresAt: new Date(now.getTime() + SHOP_ASK_TTL_MS),
        }),
      );
      // Asked, ended and asked again within minutes (a second trip): the
      // question opens in the app, but phones are not buzzed a second time.
      const tooSoon = Boolean(latest && latest.createdAt.getTime() > cooldownStart.getTime());
      return { ask: saved, notify: !tooSoon };
    });

    if (notify) {
      this.notifications.notifyShopAsk({
        homeId,
        actorId: userId,
        actorName,
        listId,
        askId: ask.id,
      });
    }
    return this.toView(ask, userId, home.members);
  }

  /** The home's open questions, newest first. */
  async active(userId: string, homeId: string): Promise<ShopAskView[]> {
    const home = await this.homes.getOne(userId, homeId);
    const rows = await this.asks.find({
      where: { homeId, expiresAt: MoreThan(new Date()) },
      order: { createdAt: "DESC" },
      take: ACTIVE_LIMIT,
    });
    return Promise.all(rows.map((row) => this.toView(row, userId, home.members)));
  }

  async reply(userId: string, askId: string, reply: ShopAskReply): Promise<ShopAskView> {
    const { ask, members } = await this.requireOpen(userId, askId);
    if (ask.askedBy === userId) {
      throw new DomainError("SHOP_ASK_OWN", "This is your own question.", HttpStatus.CONFLICT);
    }
    // One key written in one statement: two people answering at the same
    // moment can't overwrite each other.
    await this.asks.query(
      `update shop_asks
          set replies = replies || jsonb_build_object($2::text, $3::text)
        where id = $1::uuid and expires_at > now()`,
      [ask.id, userId, reply],
    );
    ask.replies = { ...ask.replies, [userId]: reply };
    return this.toView(ask, userId, members);
  }

  /**
   * Adds one item to the asked list by name alone (typed into the
   * notification). Category and unit come from the last time the home had an
   * item with that name.
   */
  async addItem(userId: string, askId: string, name: string) {
    const { ask, members } = await this.requireOpen(userId, askId);
    const typed = name.trim();
    // Already on that list: nothing to add twice. If it was parked for later,
    // asking for it now brings it back, and the shopper hears about it.
    const wanted = (await this.itemsRepo.findNeeded(ask.homeId)).find(
      (item) => item.listId === ask.listId && item.name.trim().toLowerCase() === typed.toLowerCase(),
    );
    if (wanted) {
      const view = await this.items.view(userId, wanted.id);
      if (wanted.laterAt) {
        await this.itemsRepo.setLater([wanted.id], ask.homeId, null, null);
        const actor = members.find((member) => member.id === userId);
        this.notifications.notifyItemAdded({
          homeId: ask.homeId,
          actorId: userId,
          actorName: actor?.name ?? "Member",
          itemName: wanted.name,
          urgent: wanted.urgent,
          listId: ask.listId,
        });
        return { ...view, laterAt: null, laterUntil: null };
      }
      return view;
    }
    const known = await this.itemsRepo.findLatestByName(ask.homeId, typed);
    // Its old category may have been removed since; then it goes under "Other".
    const category = await this.categories.usableOr(ask.homeId, known?.category);
    return this.items.add(userId, ask.homeId, {
      // Written the way the home wrote it before ("Milk", not "milk").
      name: known?.name ?? typed,
      quantity: 1,
      unit: known?.unit ?? undefined,
      category,
      listId: ask.listId,
    });
  }

  /** The shopper ends their question early (the trip is over). */
  async end(userId: string, askId: string) {
    const ask = await this.asks.findOne({ where: { id: askId } });
    // Already gone reads the same as ended.
    if (!ask) return { ended: true };
    await this.homes.requireMembership(userId, ask.homeId).catch(() => {
      throw notFound();
    });
    if (ask.askedBy !== userId) {
      throw new DomainError(
        "SHOP_ASK_NOT_YOURS",
        "Only the person who asked can end it.",
        HttpStatus.FORBIDDEN,
      );
    }
    // Closed, not deleted: the row still holds the cooldown for a few minutes,
    // so ending and asking again can't notify the home over and over.
    await this.asks.query(
      `update shop_asks set expires_at = now() where id = $1::uuid and expires_at > now()`,
      [ask.id],
    );
    return { ended: true };
  }

  private async requireOpen(userId: string, askId: string) {
    const ask = await this.asks.findOne({ where: { id: askId } });
    if (!ask) throw notFound();
    // Someone else's home answers like a missing question.
    const home = await this.homes.getOne(userId, ask.homeId).catch(() => {
      throw notFound();
    });
    if (ask.expiresAt.getTime() <= Date.now()) {
      throw new DomainError("SHOP_ASK_ENDED", "This question has ended.", HttpStatus.GONE);
    }
    return { ask, members: home.members as Member[] };
  }

  private async toView(ask: ShopAsk, viewerId: string, members: Member[]): Promise<ShopAskView> {
    // Counts new rows by who added them (a pin arriving meanwhile counts for
    // whoever made the pin).
    const counts = await this.itemsRepo.countAddedSince(ask.homeId, ask.listId, ask.createdAt);
    const added = new Map(counts.map((row) => [row.userId, row.count]));
    const asker = members.find((member) => member.id === ask.askedBy);
    return {
      id: ask.id,
      homeId: ask.homeId,
      listId: ask.listId,
      askedBy: ask.askedBy,
      askedByName: asker?.name ?? "Member",
      createdAt: ask.createdAt,
      expiresAt: ask.expiresAt,
      mine: ask.askedBy === viewerId,
      myReply: ask.askedBy === viewerId ? null : (ask.replies?.[viewerId] ?? null),
      myAdded: ask.askedBy === viewerId ? 0 : (added.get(viewerId) ?? 0),
      replies: members
        .filter((member) => member.id !== ask.askedBy)
        .map((member) => ({
          userId: member.id,
          name: member.name,
          reply: ask.replies?.[member.id] ?? null,
          added: added.get(member.id) ?? 0,
        })),
    };
  }
}

function notFound() {
  return new DomainError("SHOP_ASK_NOT_FOUND", "Question not found", HttpStatus.NOT_FOUND);
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}
