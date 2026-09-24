import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../common/current-user.decorator";
import { DomainError } from "../../common/domain.error";
import { HttpStatus } from "@nestjs/common";
import { User } from "../../users/user.entity";
import { CreateHomeDto, JoinHomeDto, UpdateHomeNameDto } from "./dto";
import { HomesService } from "./homes.service";

@Controller("homes")
@UseGuards(AuthGuard("jwt"))
export class HomesController {
  constructor(private readonly homes: HomesService) {}

  @Get("mine")
  async mine(@CurrentUser() user: User) {
    const home = await this.homes.getMine(user.id);
    if (!home) {
      throw new DomainError("NO_HOME", "You do not belong to a home", HttpStatus.NOT_FOUND);
    }
    return home;
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateHomeDto) {
    return this.homes.create(user.id, body.name);
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.homes.list(user.id);
  }

  @Post("join")
  join(@CurrentUser() user: User, @Body() body: JoinHomeDto) {
    return this.homes.join(user.id, body.code);
  }

  @Post(":homeId/switch")
  switchHome(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.homes.switchHome(user.id, homeId);
  }

  @Post(":homeId/leave")
  leave(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.homes.leave(user.id, homeId);
  }

  @Patch(":homeId")
  updateName(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Body() body: UpdateHomeNameDto,
  ) {
    return this.homes.updateName(user.id, homeId, body.name);
  }

  @Delete(":homeId/members/:memberId")
  removeMember(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
  ) {
    return this.homes.removeMember(user.id, homeId, memberId);
  }
}
