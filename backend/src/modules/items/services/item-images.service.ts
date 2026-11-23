import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, type Repository } from "typeorm";
import { DomainError } from "../../../common/domain.error";
import { NotAPhotoError, photoVariants } from "../../../common/storage/images";
import { photoKey } from "../../../common/storage/keys";
import { STORAGE, type Storage } from "../../../common/storage/storage";
import { HomesService } from "../../homes/services/homes.service";
import { Item } from "../entities/item.entity";
import { ItemImage } from "../entities/item-image.entity";
import { ItemsService } from "./items.service";

export type UploadedPhoto = { buffer: Buffer; mimetype: string; size: number };

/** How long a signed photo address works; the app caches the file itself far longer. */
export const SIGNED_URL_SECONDS = 3600;

export type PhotoRead =
  | { kind: "redirect"; url: string }
  | { kind: "bytes"; data: Buffer; mimeType: string };

/**
 * Item photos. With object storage configured, each photo is two files
 * (1280 px and a 256 px thumbnail for list rows) plus a tiny placeholder hash
 * in the row; without it (STORAGE_DRIVER=db) the photo stays in Postgres as
 * before. Files of deleted photos are removed by the daily job (storage_trash).
 */
@Injectable()
export class ItemImagesService {
  private readonly logger = new Logger(ItemImagesService.name);

  constructor(
    private readonly items: ItemsService,
    @InjectRepository(ItemImage) private readonly images: Repository<ItemImage>,
    @Inject(STORAGE) private readonly storage: Storage | null,
    private readonly homes: HomesService,
  ) {}

  /** Attach or replace an item's photo. Returns the updated item. */
  async set(userId: string, itemId: string, file: UploadedPhoto | undefined) {
    if (!file?.buffer?.length) {
      throw new DomainError("IMAGE_REQUIRED", "Choose a photo.", HttpStatus.BAD_REQUEST);
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new DomainError("IMAGE_INVALID", "That file isn't a photo.", HttpStatus.BAD_REQUEST);
    }
    const item = await this.items.requireItem(userId, itemId);
    await this.assertRoom(item.homeId, item.id);

    let photo: Awaited<ReturnType<typeof photoVariants>>;
    try {
      photo = await photoVariants(file.buffer);
    } catch (error) {
      if (!(error instanceof NotAPhotoError)) this.logger.warn(`Photo could not be processed: ${String(error)}`);
      throw new DomainError("IMAGE_INVALID", "That photo couldn't be read.", HttpStatus.BAD_REQUEST);
    }

    const id = randomUUID();
    const keys = [photoKey(item.homeId, id, "full"), photoKey(item.homeId, id, "thumb")];
    if (this.storage) {
      await this.storage.put(keys[0], photo.full, "image/jpeg");
      await this.storage.put(keys[1], photo.thumb, "image/jpeg");
    }
    try {
      await this.images.manager.transaction(async (manager) => {
        const repo = manager.getRepository(ItemImage);
        await repo.insert({
          id,
          itemId: item.id,
          homeId: item.homeId,
          mimeType: "image/jpeg",
          width: photo.width,
          height: photo.height,
          storage: this.storage ? "object" : "db",
          data: this.storage ? null : photo.full,
          bytes: photo.full.length,
          thumbBytes: this.storage ? photo.thumb.length : null,
          thumbhash: photo.thumbhash,
        });
        await manager.getRepository(Item).update({ id: item.id }, { imageId: id });
        // The old photo's files go to storage_trash (trigger) for the daily job.
        await repo.delete({ itemId: item.id, id: Not(id) });
      });
    } catch (error) {
      if (this.storage) await this.storage.delete(keys).catch(() => undefined);
      throw error;
    }
    return this.items.view(userId, itemId);
  }

  async remove(userId: string, itemId: string) {
    const item = await this.items.requireItem(userId, itemId);
    await this.images.manager.transaction(async (manager) => {
      await manager.getRepository(Item).update({ id: item.id }, { imageId: null });
      await manager.getRepository(ItemImage).delete({ itemId: item.id });
    });
    return this.items.view(userId, itemId);
  }

  /** For GET /item-images/:imageId: a short-lived address of the file, or the bytes kept in Postgres. */
  async read(imageId: string, size: "full" | "thumb"): Promise<PhotoRead> {
    const image = await this.images.findOne({ where: { id: imageId } });
    if (!image) throw new DomainError("IMAGE_NOT_FOUND", "Photo not found", HttpStatus.NOT_FOUND);
    if (image.storage === "object" && this.storage) {
      return { kind: "redirect", url: await this.storage.signedUrl(photoKey(image.homeId, image.id, size), SIGNED_URL_SECONDS) };
    }
    const withData = await this.images
      .createQueryBuilder("image")
      .addSelect("image.data")
      .where("image.id = :imageId", { imageId })
      .getOne();
    if (!withData?.data) throw new DomainError("IMAGE_NOT_FOUND", "Photo not found", HttpStatus.NOT_FOUND);
    return { kind: "bytes", data: withData.data, mimeType: image.mimeType };
  }

  /**
   * Moves up to `limit` photos still kept in Postgres to object storage, each
   * checked after writing. Safe to call again; answers how many are left.
   */
  async copyToStorage(limit = 50) {
    if (!this.storage) return { copied: 0, remaining: await this.images.count({ where: { storage: "db" } }), storage: false };
    const rows = await this.images
      .createQueryBuilder("image")
      .addSelect("image.data")
      .where("image.storage = 'db'")
      .orderBy("image.created_at", "ASC")
      .limit(limit)
      .getMany();
    let copied = 0;
    for (const row of rows) {
      if (!row.data) continue;
      const photo = await photoVariants(row.data);
      const full = photoKey(row.homeId, row.id, "full");
      const thumb = photoKey(row.homeId, row.id, "thumb");
      // The stored photo is already sized; keep its exact bytes as the full size.
      await this.storage.put(full, row.data, row.mimeType);
      await this.storage.put(thumb, photo.thumb, "image/jpeg");
      const check = await this.storage.get(full);
      if (check.length !== row.data.length) throw new Error(`Copy check failed for photo ${row.id}`);
      await this.images.update(
        { id: row.id, storage: "db" },
        { storage: "object", data: null, bytes: row.data.length, thumbBytes: photo.thumb.length, thumbhash: photo.thumbhash },
      );
      copied += 1;
    }
    return { copied, remaining: await this.images.count({ where: { storage: "db" } }), storage: true };
  }

  /** A plan may limit photos per home ("early" does not). */
  private async assertRoom(homeId: string, itemId: string) {
    const limit = (await this.homes.planOf(homeId)).limits.photosPerHome;
    if (limit === null) return;
    const count = await this.images.count({ where: { homeId, itemId: Not(itemId) } });
    if (count >= limit) {
      throw new DomainError("PHOTO_LIMIT", `Your plan keeps up to ${limit} photos.`, HttpStatus.CONFLICT);
    }
  }
}
