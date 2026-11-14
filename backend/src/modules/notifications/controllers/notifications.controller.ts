import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../../common/current-user.decorator";
import { User } from "../../../users/user.entity";
import { NotificationPrefsDto, PushTokenDto, RemovePushTokenDto } from "../dto/notifications.dto";
import { NotificationsService } from "../services/notifications.service";

@Controller("notifications")
@UseGuards(AuthGuard("jwt"))
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post("devices")
  register(@CurrentUser() user: User, @Body() body: PushTokenDto) {
    return this.notifications.register(user.id, body.token, body.locale, body.previousToken);
  }

  @Get("preferences")
  preferences(@CurrentUser() user: User) {
    return this.notifications.preferences(user.id);
  }

  @Patch("preferences")
  updatePreferences(@CurrentUser() user: User, @Body() body: NotificationPrefsDto) {
    return this.notifications.updatePreferences(user.id, body);
  }

  @Delete("devices")
  unregister(@CurrentUser() user: User, @Body() body: RemovePushTokenDto) {
    return this.notifications.unregister(user.id, body.token);
  }
}
