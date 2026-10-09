import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../../users/user.entity";
import { AuthController } from "./controllers/auth.controller";
import { RefreshToken } from "./entities/refresh-token.entity";
import { JwtStrategy } from "./jwt.strategy";
import { AUTH_REPOSITORY } from "./repo/auth-repo/auth.repository";
import { TypeormAuthRepository } from "./repo/auth-repo/typeorm-auth.repository";
import { AuthService } from "./services/auth.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: AUTH_REPOSITORY, useClass: TypeormAuthRepository },
  ],
  exports: [AuthService],
})
export class AuthModule {}
