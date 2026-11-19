import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../../common/current-user.decorator";
import { User } from "../../../users/user.entity";
import { ShopAskItemDto, ShopAskReplyDto } from "../dto/items.dto";
import { ShopAsksService } from "../services/shop-asks.service";

/** "Anything missing?": a shopper asks the rest of the home during a trip. */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class ShopAsksController {
  constructor(private readonly asks: ShopAsksService) {}

  @Get("homes/:homeId/shop-asks")
  active(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.asks.active(user.id, homeId);
  }

  @Post("homes/:homeId/lists/:listId/shop-asks")
  ask(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("listId", ParseUUIDPipe) listId: string,
  ) {
    return this.asks.ask(user.id, homeId, listId);
  }

  @Post("shop-asks/:askId/reply")
  reply(
    @CurrentUser() user: User,
    @Param("askId", ParseUUIDPipe) askId: string,
    @Body() body: ShopAskReplyDto,
  ) {
    return this.asks.reply(user.id, askId, body.reply);
  }

  /** An item typed straight into the notification. */
  @Post("shop-asks/:askId/items")
  addItem(
    @CurrentUser() user: User,
    @Param("askId", ParseUUIDPipe) askId: string,
    @Body() body: ShopAskItemDto,
  ) {
    return this.asks.addItem(user.id, askId, body.name);
  }

  @Delete("shop-asks/:askId")
  end(@CurrentUser() user: User, @Param("askId", ParseUUIDPipe) askId: string) {
    return this.asks.end(user.id, askId);
  }
}
