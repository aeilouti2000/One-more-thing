import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { EmailToken } from "./auth/email-token.entity";
import { RefreshToken } from "./auth/refresh-token.entity";
import { type AppConfig, validateEnv } from "./config/env";
import { Init1740000000000 } from "./database/migrations/1740000000000-Init";
import { HealthController } from "./health.controller";
import { HomeMember } from "./homes/home-member.entity";
import { Home } from "./homes/home.entity";
import { HomesModule } from "./homes/homes.module";
import { Item } from "./items/item.entity";
import { ItemsModule } from "./items/items.module";
import { MailModule } from "./mail/mail.module";
import { User } from "./users/user.entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        type: "postgres" as const,
        url: config.get("DATABASE_URL", { infer: true }),
        entities: [User, EmailToken, RefreshToken, Home, HomeMember, Item],
        migrations: [Init1740000000000],
        migrationsRun: true,
      }),
    }),
    MailModule,
    AuthModule,
    HomesModule,
    ItemsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
