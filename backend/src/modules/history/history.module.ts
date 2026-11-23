import { Module } from "@nestjs/common";
import { HomesModule } from "../homes/homes.module";
import { ItemsModule } from "../items/items.module";
import { HistoryController } from "./history.controller";
import { HistoryRepository } from "./history.repository";
import { HistoryService } from "./history.service";

@Module({
  imports: [HomesModule, ItemsModule],
  controllers: [HistoryController],
  providers: [HistoryService, HistoryRepository],
  exports: [HistoryRepository],
})
export class HistoryModule {}
