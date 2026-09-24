import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HomeMember } from "./home-member.entity";
import { Home } from "./home.entity";
import { HomesController } from "./homes.controller";
import { HomesService } from "./homes.service";

@Module({
  imports: [TypeOrmModule.forFeature([Home, HomeMember])],
  controllers: [HomesController],
  providers: [HomesService],
  exports: [HomesService],
})
export class HomesModule {}
