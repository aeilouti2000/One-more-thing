import { Body, Controller, Delete, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../common/current-user.decorator";
import { User } from "../../users/user.entity";
import { PushTokenDto, RemovePushTokenDto } from "./dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(AuthGuard("jwt"))
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post("devices")
  register(@CurrentUser() user: User, @Body() body: PushTokenDto) {
    return this.notifications.register(user.id, body.token, body.locale);
  }

  @Delete("devices")
  unregister(@CurrentUser() user: User, @Body() body: RemovePushTokenDto) {
    return this.notifications.unregister(user.id, body.token);
  }
}
