import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../../users/user.entity";
import { HomesModule } from "../homes/homes.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ItemImagesController } from "./controllers/item-images.controller";
import { ItemsController } from "./controllers/items.controller";
import { PinsController } from "./controllers/pins.controller";
import { PinsCronController } from "./controllers/pins-cron.controller";
import { SetsController } from "./controllers/sets.controller";
import { ShopAsksController } from "./controllers/shop-asks.controller";
import { CustomCategory } from "./entities/custom-category.entity";
import { HiddenCategory } from "./entities/hidden-category.entity";
import { Item } from "./entities/item.entity";
import { ItemSet } from "./entities/item-set.entity";
import { ShopAsk } from "./entities/shop-ask.entity";
import { ItemImage } from "./entities/item-image.entity";
import { ListShopLock } from "./entities/list-shop-lock.entity";
import { Pin } from "./entities/pin.entity";
import { ShoppingList } from "./entities/shopping-list.entity";
import { TripReceipt } from "./entities/trip-receipt.entity";
import { CATEGORIES_REPOSITORY } from "./repo/categories-repo/categories.repository";
import { TypeormCategoriesRepository } from "./repo/categories-repo/typeorm-categories.repository";
import { ITEMS_REPOSITORY } from "./repo/items-repo/items.repository";
import { TypeormItemsRepository } from "./repo/items-repo/typeorm-items.repository";
import { LISTS_REPOSITORY } from "./repo/lists-repo/lists.repository";
import { TypeormListsRepository } from "./repo/lists-repo/typeorm-lists.repository";
import { PINS_REPOSITORY } from "./repo/pins-repo/pins.repository";
import { TypeormPinsRepository } from "./repo/pins-repo/typeorm-pins.repository";
import { CategoriesService } from "./services/categories.service";
import { ItemImagesService } from "./services/item-images.service";
import { ItemsService } from "./services/items.service";
import { PinsScheduler } from "./services/pins.scheduler";
import { PinsService } from "./services/pins.service";
import { SetsService } from "./services/sets.service";
import { ShopAsksService } from "./services/shop-asks.service";
import { ShopLocksService } from "./services/shop-locks.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Item,
      ShoppingList,
      ListShopLock,
      Pin,
      User,
      CustomCategory,
      HiddenCategory,
      TripReceipt,
      ItemImage,
      ShopAsk,
      ItemSet,
    ]),
    HomesModule,
    NotificationsModule,
  ],
  controllers: [
    ItemsController,
    ItemImagesController,
    PinsController,
    PinsCronController,
    ShopAsksController,
    SetsController,
  ],
  providers: [
    ItemsService,
    ItemImagesService,
    PinsService,
    PinsScheduler,
    CategoriesService,
    ShopLocksService,
    ShopAsksService,
    SetsService,
    { provide: ITEMS_REPOSITORY, useClass: TypeormItemsRepository },
    { provide: LISTS_REPOSITORY, useClass: TypeormListsRepository },
    { provide: PINS_REPOSITORY, useClass: TypeormPinsRepository },
    { provide: CATEGORIES_REPOSITORY, useClass: TypeormCategoriesRepository },
  ],
})
export class ItemsModule {}
