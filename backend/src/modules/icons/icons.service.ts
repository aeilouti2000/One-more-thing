import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DomainError } from "../../common/domain.error";
import { NotAPhotoError, openPhoto } from "../../common/storage/images";
import { iconKey } from "../../common/storage/keys";
import { STORAGE, type Storage } from "../../common/storage/storage";
import { HomesService } from "../homes/services/homes.service";
import { CategoriesService } from "../items/services/categories.service";
import { nameKey } from "../items/utils/name-key";
import { isSingleEmoji } from "./emoji";

export type IconKind = "category" | "shop";
export type IconTarget = { kind: IconKind; key?: string; name?: string };
export type IconView = { kind: IconKind; key: string; label: string | null; emoji: string | null; imageId: string | null };

const ICON_SIDE = 192;
export const ICON_URL_SECONDS = 3600;

/**
 * Icons a home chose for its categories and shops. Any member may change one,
 * the same rule as adding a category or renaming a trip.
 */
@Injectable()
export class IconsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly homes: HomesService,
    private readonly categories: CategoriesService,
    @Inject(STORAGE) private readonly storage: Storage | null,
  ) {}

  async list(userId: string, homeId: string) {
    await this.homes.requireMembership(userId, homeId);
    return this.forHome(homeId);
  }

  /** The home's icons, for the changes answer. */
  async forHome(homeId: string): Promise<IconView[]> {
    const rows: { kind: IconKind; key: string; label: string | null; emoji: string | null; image_id: string | null }[] =
      await this.dataSource.query(
        `select kind, key, label, emoji, image_id from home_icons where home_id = $1 order by kind, key`,
        [homeId],
      );
    return rows.map((row) => ({ kind: row.kind, key: row.key, label: row.label, emoji: row.emoji, imageId: row.image_id }));
  }

  async setEmoji(userId: string, homeId: string, target: IconTarget, emoji: string) {
    await this.homes.requireMembership(userId, homeId);
    if (!isSingleEmoji(emoji)) {
      throw new DomainError("ICON_EMOJI_INVALID", "Pick one emoji.", HttpStatus.BAD_REQUEST);
    }
    const { key, label } = await this.resolve(homeId, target);
    await this.dataSource.query(
      `insert into home_icons (home_id, kind, key, label, emoji, image_id, image_bytes, data, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, null, null, null, $6, now())
       on conflict (home_id, kind, key) do update set
         label = excluded.label, emoji = excluded.emoji, image_id = null, image_bytes = null, data = null,
         updated_by = excluded.updated_by, updated_at = now()`,
      [homeId, target.kind, key, label, emoji, userId],
    );
    return this.one(homeId, target.kind, key);
  }

  async setImage(userId: string, homeId: string, target: IconTarget, file: { buffer: Buffer; mimetype: string } | undefined) {
    await this.homes.requireMembership(userId, homeId);
    if (!file?.buffer?.length || !file.mimetype.startsWith("image/")) {
      throw new DomainError("IMAGE_INVALID", "That file isn't a photo.", HttpStatus.BAD_REQUEST);
    }
    const { key, label } = await this.resolve(homeId, target);
    await this.assertRoom(homeId, target.kind, key);

    let webp: Buffer;
    try {
      // A centred square, small enough for a row icon; WebP keeps transparency.
      webp = await (await openPhoto(file.buffer))
        .resize({ width: ICON_SIDE, height: ICON_SIDE, fit: "cover", position: "centre" })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof NotAPhotoError || error instanceof Error) {
        throw new DomainError("IMAGE_INVALID", "That photo couldn't be read.", HttpStatus.BAD_REQUEST);
      }
      throw error;
    }

    const imageId = randomUUID();
    if (this.storage) await this.storage.put(iconKey(homeId, imageId), webp, "image/webp");
    try {
      // The replaced image's file goes to storage_trash (trigger).
      await this.dataSource.query(
        `insert into home_icons (home_id, kind, key, label, emoji, image_id, image_bytes, data, updated_by, updated_at)
         values ($1, $2, $3, $4, null, $5, $6, $7, $8, now())
         on conflict (home_id, kind, key) do update set
           label = excluded.label, emoji = null, image_id = excluded.image_id, image_bytes = excluded.image_bytes,
           data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`,
        [homeId, target.kind, key, label, imageId, webp.length, this.storage ? null : webp, userId],
      );
    } catch (error) {
      if (this.storage) await this.storage.delete([iconKey(homeId, imageId)]).catch(() => undefined);
      throw error;
    }
    return this.one(homeId, target.kind, key);
  }

  async reset(userId: string, homeId: string, target: IconTarget) {
    await this.homes.requireMembership(userId, homeId);
    const key = target.kind === "shop" ? nameKey(target.name ?? "") : (target.key ?? "");
    await this.dataSource.query(`delete from home_icons where home_id = $1 and kind = $2 and key = $3`, [
      homeId,
      target.kind,
      key,
    ]);
    return { kind: target.kind, key, label: null, emoji: null, imageId: null };
  }

  /** For GET /icons/:imageId: a short-lived address, or the bytes while images stay in Postgres. */
  async read(imageId: string) {
    const rows: { home_id: string; data: Buffer | null }[] = await this.dataSource.query(
      `select home_id, data from home_icons where image_id = $1`,
      [imageId],
    );
    const row = rows[0];
    if (!row) throw new DomainError("IMAGE_NOT_FOUND", "Icon not found", HttpStatus.NOT_FOUND);
    if (row.data) return { kind: "bytes" as const, data: row.data };
    if (!this.storage) throw new DomainError("IMAGE_NOT_FOUND", "Icon not found", HttpStatus.NOT_FOUND);
    return { kind: "redirect" as const, url: await this.storage.signedUrl(iconKey(row.home_id, imageId), ICON_URL_SECONDS) };
  }

  /** The stored key and label of an icon target, checked. */
  private async resolve(homeId: string, target: IconTarget) {
    if (target.kind === "category") {
      const key = target.key ?? "";
      await this.categories.assertUsable(homeId, key);
      return { key, label: null };
    }
    const label = (target.name ?? "").trim().slice(0, 80);
    const key = nameKey(label);
    if (!key) throw new DomainError("SHOP_NAME_REQUIRED", "Name the shop first.", HttpStatus.BAD_REQUEST);
    return { key, label };
  }

  private async assertRoom(homeId: string, kind: IconKind, key: string) {
    const limit = (await this.homes.planOf(homeId)).limits.iconImages;
    const [{ count }] = await this.dataSource.query(
      `select count(*)::int as count from home_icons
        where home_id = $1 and image_id is not null and not (kind = $2 and key = $3)`,
      [homeId, kind, key],
    );
    if (count >= limit) {
      throw new DomainError("ICON_LIMIT", `Your plan keeps up to ${limit} icon images.`, HttpStatus.CONFLICT);
    }
  }

  private async one(homeId: string, kind: IconKind, key: string) {
    return (await this.forHome(homeId)).find((icon) => icon.kind === kind && icon.key === key) as IconView;
  }
}
