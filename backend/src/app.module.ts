import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { UserThrottlerGuard } from "./common/user-throttler.guard";
import { CommonModule } from "./common/common.module";
import { SlowQueryLogger } from "./common/slow-query-logger";
import { StorageModule } from "./common/storage/storage.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./modules/auth/auth.module";
import { RefreshToken } from "./modules/auth/entities/refresh-token.entity";
import { type AppConfig, validateEnv } from "./config/env";
import { LegalController } from "./legal/legal.controller";
import { MIGRATIONS } from "./database/migrations";
import { EmailCode } from "./modules/auth/entities/email-code.entity";
import { AppReleaseController } from "./app-release.controller";
import { HealthController } from "./health.controller";
import { HomeMember } from "./modules/homes/entities/home-member.entity";
import { Home } from "./modules/homes/entities/home.entity";
import { HomesModule } from "./modules/homes/homes.module";
import { CustomCategory } from "./modules/items/entities/custom-category.entity";
import { HiddenCategory } from "./modules/items/entities/hidden-category.entity";
import { Item } from "./modules/items/entities/item.entity";
import { ItemSet } from "./modules/items/entities/item-set.entity";
import { ShopAsk } from "./modules/items/entities/shop-ask.entity";
import { ListShopLock } from "./modules/items/entities/list-shop-lock.entity";
import { Pin } from "./modules/items/entities/pin.entity";
import { ShoppingList } from "./modules/items/entities/shopping-list.entity";
import { TripReceipt } from "./modules/items/entities/trip-receipt.entity";
import { ItemImage } from "./modules/items/entities/item-image.entity";
import { ItemsModule } from "./modules/items/items.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { SyncModule } from "./modules/sync/sync.module";
import { HistoryModule } from "./modules/history/history.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { IconsModule } from "./modules/icons/icons.module";
import { PushToken } from "./modules/notifications/entities/push-token.entity";
import { User } from "./users/user.entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const databaseUrl = config.get("DATABASE_URL", { infer: true });
        const useSsl =
          config.get("DATABASE_SSL", { infer: true }) === "true" ||
          /sslmode=(require|verify-full|verify-ca|prefer)/i.test(databaseUrl);
        const url = databaseUrl.replace(/([?&])sslmode=[^&]*/gi, "$1").replace(/[?&]$/, "");

        return {
          type: "postgres" as const,
          url,
          ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
          entities: [
            User,
            RefreshToken,
            Home,
            HomeMember,
            Item,
            ShoppingList,
            ListShopLock,
            Pin,
            PushToken,
            CustomCategory,
            HiddenCategory,
            TripReceipt,
            ItemImage,
            EmailCode,
            ShopAsk,
            ItemSet,
          ],
          migrations: MIGRATIONS,
          // One transaction per migration, so a migration can opt out (an index
          // built "concurrently" cannot run inside a transaction).
          migrationsTransactionMode: "each" as const,
          migrationsRun: true,
          // Any query slower than this is written to the log with its SQL.
          maxQueryExecutionTime: 200,
          logger: new SlowQueryLogger(),
        };
      },
    }),
    CommonModule,
    StorageModule,
    AuthModule,
    HomesModule,
    ItemsModule,
    NotificationsModule,
    SyncModule,
    HistoryModule,
    MaintenanceModule,
    IconsModule,
  ],
  controllers: [HealthController, AppReleaseController, LegalController],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
