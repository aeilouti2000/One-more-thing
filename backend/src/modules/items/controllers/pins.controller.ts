import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../../common/current-user.decorator";
import { User } from "../../../users/user.entity";
import { CreatePinDto } from "../dto/items.dto";
import { ItemsService } from "../services/items.service";
import { PinsService } from "../services/pins.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PinsController {
  constructor(
    private readonly pins: PinsService,
    private readonly items: ItemsService,
  ) {}

  @Get("homes/:homeId/pins")
  list(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.pins.list(user.id, homeId);
  }

  @Post("homes/:homeId/pins")
  add(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreatePinDto,
  ) {
    return this.pins.add(user.id, homeId, body, (notify) =>
      body.addNow === false
        ? Promise.resolve(null)
        : this.items.add(
            user.id,
            homeId,
            {
              name: body.name,
              quantity: body.quantity,
              category: body.category,
              unit: body.unit,
              notes: body.notes,
              urgent: body.urgent,
              listId: body.listId,
            },
            { notify },
          ),
    );
  }

  @Delete("pins/:pinId")
  remove(@CurrentUser() user: User, @Param("pinId", ParseUUIDPipe) pinId: string) {
    return this.pins.remove(user.id, pinId);
  }
}
