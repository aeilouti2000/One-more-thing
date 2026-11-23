import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../common/current-user.decorator";
import type { User } from "../../users/user.entity";
import { MonthParamDto, PurchasesQueryDto, TripsQueryDto } from "./history.dto";
import { HistoryService } from "./history.service";

@Controller("homes/:homeId/history")
@UseGuards(AuthGuard("jwt"))
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get("purchases")
  purchases(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Query() query: PurchasesQueryDto,
  ) {
    return this.history.purchases(user.id, homeId, query);
  }

  @Get("trips")
  trips(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string, @Query() query: TripsQueryDto) {
    return this.history.trips(user.id, homeId, query);
  }

  @Get("trips/:tripId")
  trip(
    @CurrentUser() user: User,
    @Param("homeId", ParseUUIDPipe) homeId: string,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ) {
    return this.history.trip(user.id, homeId, tripId);
  }

  @Get("months")
  months(@CurrentUser() user: User, @Param("homeId", ParseUUIDPipe) homeId: string) {
    return this.history.months(user.id, homeId);
  }

  @Get("months/:month")
  month(@CurrentUser() user: User, @Param() params: MonthParamDto) {
    return this.history.month(user.id, params.homeId, params.month);
  }
}
