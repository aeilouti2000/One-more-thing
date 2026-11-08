import { Controller, Get, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { Response } from "express";
import { ItemImagesService } from "../services/item-images.service";

/**
 * Photo bytes, without a sign-in header so <Image> can load them directly.
 * The id is a random UUID that only members of the item's home ever see, and
 * it changes whenever the photo is replaced or removed.
 */
@Controller("item-images")
export class ItemImagesController {
  constructor(private readonly images: ItemImagesService) {}

  @Get(":imageId")
  async read(@Param("imageId", ParseUUIDPipe) imageId: string, @Res() res: Response) {
    const image = await this.images.read(imageId);
    res.set({
      "Content-Type": image.mimeType,
      "Content-Length": String(image.data.length),
      // Immutable: a changed photo gets a new id.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    res.send(image.data);
  }
}
