import { Module } from "@nestjs/common";
import { ItemsModule } from "../items/items.module";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [ItemsModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
