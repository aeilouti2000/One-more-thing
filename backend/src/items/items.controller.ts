import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../common/current-user.decorator";
import { User } from "../users/user.entity";
import { CreateItemDto, ItemIdsDto, UpdateItemDto } from "./dto";
import { ItemsService } from "./items.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get("homes/:homeId/items")
  list(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.items.list(user.id, homeId);
  }

  @Post("homes/:homeId/items")
  add(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreateItemDto,
  ) {
    return this.items.add(user.id, homeId, body);
  }

  @Patch("items/:itemId")
  update(
    @CurrentUser() user: User,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.items.updateDetails(user.id, itemId, body);
  }

  @Post("items/:itemId/bought")
  markBought(@CurrentUser() user: User, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.items.markBought(user.id, itemId);
  }

  @Post("items/bought")
  markMany(@CurrentUser() user: User, @Body() body: ItemIdsDto) {
    return this.items.markManyBought(user.id, body.ids);
  }

  @Post("items/delete")
  removeMany(@CurrentUser() user: User, @Body() body: ItemIdsDto) {
    return this.items.removeMany(user.id, body.ids);
  }
}
