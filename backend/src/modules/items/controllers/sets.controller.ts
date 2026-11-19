import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../../common/current-user.decorator";
import { User } from "../../../users/user.entity";
import { AddSetDto, CreateSetDto, UpdateSetDto } from "../dto/items.dto";
import { SetsService } from "../services/sets.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class SetsController {
  constructor(private readonly sets: SetsService) {}

  @Get("homes/:homeId/sets")
  list(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.sets.list(user.id, homeId);
  }

  @Post("homes/:homeId/sets")
  create(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: CreateSetDto,
  ) {
    return this.sets.create(user.id, homeId, body);
  }

  @Patch("sets/:setId")
  update(
    @CurrentUser() user: User,
    @Param("setId", ParseUUIDPipe) setId: string,
    @Body() body: UpdateSetDto,
  ) {
    return this.sets.update(user.id, setId, body);
  }

  @Delete("sets/:setId")
  remove(@CurrentUser() user: User, @Param("setId", ParseUUIDPipe) setId: string) {
    return this.sets.remove(user.id, setId);
  }

  @Post("sets/:setId/add")
  add(
    @CurrentUser() user: User,
    @Param("setId", ParseUUIDPipe) setId: string,
    @Body() body: AddSetDto,
  ) {
    return this.sets.addToList(user.id, setId, body?.listId);
  }
}
