import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HomesModule } from "../homes/homes.module";
import { User } from "../users/user.entity";
import { Item } from "./item.entity";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";

@Module({
  imports: [TypeOrmModule.forFeature([Item, User]), HomesModule],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
