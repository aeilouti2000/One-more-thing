import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { CurrentUser } from "../../common/current-user.decorator";
import type { User } from "../../users/user.entity";
import { IconTargetDto, SetEmojiDto } from "./icons.dto";
import { IconsService } from "./icons.service";

@Controller("homes/:homeId/icons")
@UseGuards(AuthGuard("jwt"))
export class HomeIconsController {
  constructor(private readonly icons: IconsService) {}

  @Get()
  list(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.icons.list(user.id, homeId);
  }

  @Put()
  setEmoji(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string, @Body() body: SetEmojiDto) {
    return this.icons.setEmoji(user.id, homeId, body, body.emoji);
  }

  /** Multipart: `kind`, `key` or `name`, and the image as `file`. */
  @Put("image")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  setImage(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: IconTargetDto,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
  ) {
    return this.icons.setImage(user.id, homeId, body, file);
  }

  @Delete()
  reset(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string, @Query() query: IconTargetDto) {
    return this.icons.reset(user.id, homeId, query);
  }
}

/** Icon images, without a sign-in header, like item photos (random ids only members see). */
@SkipThrottle()
@Controller("icons")
export class IconImagesController {
  constructor(private readonly icons: IconsService) {}

  @Get(":imageId")
  async read(@Param("imageId", ParseUUIDPipe) imageId: string, @Res() res: Response) {
    const icon = await this.icons.read(imageId);
    if (icon.kind === "redirect") {
      res.set("Cache-Control", "private, max-age=3000");
      res.redirect(302, icon.url);
      return;
    }
    res.set({ "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" });
    res.send(icon.data);
  }
}
