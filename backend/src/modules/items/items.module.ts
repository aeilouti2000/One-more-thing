import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../../users/user.entity";
import { HomesModule } from "../homes/homes.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ItemsController } from "./controllers/items.controller";
import { PinsController } from "./controllers/pins.controller";
import { CustomCategory } from "./entities/custom-category.entity";
import { HiddenCategory } from "./entities/hidden-category.entity";
import { Item } from "./entities/item.entity";
import { Pin } from "./entities/pin.entity";
import { ShoppingList } from "./entities/shopping-list.entity";
import { CATEGORIES_REPOSITORY } from "./repo/categories-repo/categories.repository";
import { TypeormCategoriesRepository } from "./repo/categories-repo/typeorm-categories.repository";
import { ITEMS_REPOSITORY } from "./repo/items-repo/items.repository";
import { TypeormItemsRepository } from "./repo/items-repo/typeorm-items.repository";
import { LISTS_REPOSITORY } from "./repo/lists-repo/lists.repository";
import { TypeormListsRepository } from "./repo/lists-repo/typeorm-lists.repository";
import { PINS_REPOSITORY } from "./repo/pins-repo/pins.repository";
import { TypeormPinsRepository } from "./repo/pins-repo/typeorm-pins.repository";
import { CategoriesService } from "./services/categories.service";
import { ItemsService } from "./services/items.service";
import { PinsScheduler } from "./services/pins.scheduler";
import { PinsService } from "./services/pins.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Item, ShoppingList, Pin, User, CustomCategory, HiddenCategory]),
    HomesModule,
    NotificationsModule,
  ],
  controllers: [ItemsController, PinsController],
  providers: [
    ItemsService,
    PinsService,
    PinsScheduler,
    CategoriesService,
    { provide: ITEMS_REPOSITORY, useClass: TypeormItemsRepository },
    { provide: LISTS_REPOSITORY, useClass: TypeormListsRepository },
    { provide: PINS_REPOSITORY, useClass: TypeormPinsRepository },
    { provide: CATEGORIES_REPOSITORY, useClass: TypeormCategoriesRepository },
  ],
})
export class ItemsModule {}
