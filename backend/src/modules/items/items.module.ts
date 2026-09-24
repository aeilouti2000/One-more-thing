import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HomesModule } from "../homes/homes.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { User } from "../../users/user.entity";
import { Item } from "./item.entity";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";
import { Staple } from "./staple.entity";
import { StaplesController } from "./staples.controller";
import { StaplesService } from "./staples.service";

@Module({
  imports: [TypeOrmModule.forFeature([Item, Staple, User]), HomesModule, NotificationsModule],
  controllers: [ItemsController, StaplesController],
  providers: [ItemsService, StaplesService],
})
export class ItemsModule {}
