import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { ItemImagesService } from "../services/item-images.service";

/**
 * Photos, without a sign-in header so <Image> can load them directly. The id
 * is a random UUID that only members of the item's home ever see, and it
 * changes whenever the photo is replaced or removed.
 *
 * Photos in object storage answer with a redirect to a short-lived signed
 * address (the phone caches the file under its own key); photos still in
 * Postgres answer with their bytes, as before. `?size=thumb` asks for the
 * 256 px version for list rows.
 */
@SkipThrottle()
@Controller("item-images")
export class ItemImagesController {
  constructor(private readonly images: ItemImagesService) {}

  @Get(":imageId")
  async read(
    @Param("imageId", ParseUUIDPipe) imageId: string,
    @Query("size") size: string | undefined,
    @Res() res: Response,
  ) {
    const photo = await this.images.read(imageId, size === "thumb" ? "thumb" : "full");
    if (photo.kind === "redirect") {
      // A little shorter than the signed address lives, so a cached redirect never points at an expired one.
      res.set("Cache-Control", "private, max-age=3000");
      res.redirect(302, photo.url);
      return;
    }
    res.set({
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.data.length),
      // Immutable: a changed photo gets a new id.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    res.send(photo.data);
  }
}
