import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HomesController } from "./controllers/homes.controller";
import { HomeMember } from "./entities/home-member.entity";
import { Home } from "./entities/home.entity";
import { HOMES_REPOSITORY } from "./repo/homes-repo/homes.repository";
import { TypeormHomesRepository } from "./repo/homes-repo/typeorm-homes.repository";
import { HomesService } from "./services/homes.service";

@Module({
  imports: [TypeOrmModule.forFeature([Home, HomeMember])],
  controllers: [HomesController],
  providers: [
    HomesService,
    { provide: HOMES_REPOSITORY, useClass: TypeormHomesRepository },
  ],
  exports: [HomesService],
})
export class HomesModule {}
