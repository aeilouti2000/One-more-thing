import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import sharp from "sharp";
import { Not, type Repository } from "typeorm";
import { DomainError } from "../../../common/domain.error";
import { Item } from "../entities/item.entity";
import { ItemImage } from "../entities/item-image.entity";
import { ItemsService } from "./items.service";

/** Longest side of a stored photo. Enough to read a label on any phone. */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 78;
/** Refuse decompression bombs: ~50 MP is far above any phone camera. */
const MAX_INPUT_PIXELS = 50_000_000;

export type UploadedPhoto = { buffer: Buffer; mimetype: string; size: number };

@Injectable()
export class ItemImagesService {
  constructor(
    private readonly items: ItemsService,
    @InjectRepository(ItemImage) private readonly images: Repository<ItemImage>,
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

    let output: { data: Buffer; info: sharp.OutputInfo };
    try {
      // rotate() applies the camera's EXIF orientation; the JPEG we write
      // carries no metadata, so location and device details are dropped.
      output = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new DomainError("IMAGE_INVALID", "That photo couldn't be read.", HttpStatus.BAD_REQUEST);
    }

    await this.images.manager.transaction(async (manager) => {
      const saved = await manager.getRepository(ItemImage).save(
        manager.getRepository(ItemImage).create({
          itemId: item.id,
          homeId: item.homeId,
          mimeType: "image/jpeg",
          width: output.info.width,
          height: output.info.height,
          data: output.data,
        }),
      );
      await manager.getRepository(Item).update({ id: item.id }, { imageId: saved.id });
      await manager.getRepository(ItemImage).delete({ itemId: item.id, id: Not(saved.id) });
    });

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

  /** Bytes for GET /item-images/:imageId. */
  async read(imageId: string) {
    const image = await this.images
      .createQueryBuilder("image")
      .addSelect("image.data")
      .where("image.id = :imageId", { imageId })
      .getOne();
    if (!image) {
      throw new DomainError("IMAGE_NOT_FOUND", "Photo not found", HttpStatus.NOT_FOUND);
    }
    return image;
  }
}
