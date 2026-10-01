import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HomesModule } from "../homes/homes.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { User } from "../../users/user.entity";
import { CategoriesService } from "./categories.service";
import { CustomCategory } from "./custom-category.entity";
import { HiddenCategory } from "./hidden-category.entity";
import { Item } from "./item.entity";
import { ShoppingList } from "./shopping-list.entity";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";
import { Staple } from "./staple.entity";
import { StaplesController } from "./staples.controller";
import { StaplesService } from "./staples.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Item, ShoppingList, Staple, User, CustomCategory, HiddenCategory]),
    HomesModule,
    NotificationsModule,
  ],
  controllers: [ItemsController, StaplesController],
  providers: [ItemsService, StaplesService, CategoriesService],
})
export class ItemsModule {}
