import { Module } from "@nestjs/common";
import { HomesModule } from "../homes/homes.module";
import { ItemsModule } from "../items/items.module";
import { HomeIconsController, IconImagesController } from "./icons.controller";
import { IconsService } from "./icons.service";

@Module({
  imports: [HomesModule, ItemsModule],
  controllers: [HomeIconsController, IconImagesController],
  providers: [IconsService],
  exports: [IconsService],
})
export class IconsModule {}
