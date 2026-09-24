import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MailModule } from "../mail/mail.module";
import { User } from "../users/user.entity";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailToken } from "./email-token.entity";
import { JwtStrategy } from "./jwt.strategy";
import { RefreshToken } from "./refresh-token.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmailToken, RefreshToken]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({}),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, TypeOrmModule],
})
export class AuthModule {}
