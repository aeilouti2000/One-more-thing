import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../common/current-user.decorator";
import { User } from "../../users/user.entity";
import { CreateStapleDto } from "./dto";
import { ItemsService } from "./items.service";
import { StaplesService } from "./staples.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class StaplesController {
  constructor(
    private readonly staples: StaplesService,
    private readonly items: ItemsService,
  ) {}

  @Get("homes/:homeId/staples")
  list(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.staples.list(user.id, homeId);
  }

  @Post("homes/:homeId/staples")
  add(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreateStapleDto,
  ) {
    return this.staples.add(user.id, homeId, body, (notify) =>
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
            },
            { notify },
          ),
    );
  }

  @Delete("staples/:stapleId")
  remove(@CurrentUser() user: User, @Param("stapleId", ParseUUIDPipe) stapleId: string) {
    return this.staples.remove(user.id, stapleId);
  }
}
