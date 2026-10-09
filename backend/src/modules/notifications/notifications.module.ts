import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HomeMember } from "../homes/entities/home-member.entity";
import { NotificationsController } from "./controllers/notifications.controller";
import { PushToken } from "./entities/push-token.entity";
import { NOTIFICATIONS_REPOSITORY } from "./repo/notifications-repo/notifications.repository";
import { TypeormNotificationsRepository } from "./repo/notifications-repo/typeorm-notifications.repository";
import { NotificationsService } from "./services/notifications.service";

@Module({
  imports: [TypeOrmModule.forFeature([PushToken, HomeMember])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATIONS_REPOSITORY, useClass: TypeormNotificationsRepository },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
