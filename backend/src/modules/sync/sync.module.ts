import { Module } from "@nestjs/common";
import { HomesModule } from "../homes/homes.module";
import { IconsModule } from "../icons/icons.module";
import { ItemsModule } from "../items/items.module";
import { SyncController } from "./sync.controller";
import { SyncRepository } from "./sync.repository";
import { SyncService } from "./sync.service";

@Module({
  imports: [HomesModule, ItemsModule, IconsModule],
  controllers: [SyncController],
  providers: [SyncService, SyncRepository],
})
export class SyncModule {}
