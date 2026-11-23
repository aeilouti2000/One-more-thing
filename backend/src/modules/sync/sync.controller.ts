import { Controller, Get, Headers, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SkipThrottle } from "@nestjs/throttler";
import { CurrentUser } from "../../common/current-user.decorator";
import type { User } from "../../users/user.entity";
import { ChangesQueryDto } from "./sync.dto";
import { SyncService } from "./sync.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /**
   * Phones call this every few seconds during a trip and on every return to the
   * app. "Nothing changed" is the usual answer and costs one row read, so it is
   * left out of the per-user rate limit.
   */
  @SkipThrottle()
  @Get("homes/:homeId/changes")
  changes(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Query() query: ChangesQueryDto,
    @Headers("x-timezone") timezone?: string,
  ) {
    return this.sync.changes(user.id, homeId, query.since ?? null, timezone);
  }
}
