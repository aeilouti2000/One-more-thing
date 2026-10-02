import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./modules/auth/auth.module";
import { RefreshToken } from "./modules/auth/refresh-token.entity";
import { type AppConfig, validateEnv } from "./config/env";
import { ItemSortOrder1740000000006 } from "./database/migrations/1740000000006-ItemSortOrder";
import { CustomCategories1740000000008 } from "./database/migrations/1740000000008-CustomCategories";
import { ItemCosts1740000000009 } from "./database/migrations/1740000000009-ItemCosts";
import { ShoppingLists1740000000007 } from "./database/migrations/1740000000007-ShoppingLists";
import { ManyHomes1740000000005 } from "./database/migrations/1740000000005-ManyHomes";
import { ShoppingTrip1740000000004 } from "./database/migrations/1740000000004-ShoppingTrip";
import { AddPushTokens1740000000003 } from "./database/migrations/1740000000003-AddPushTokens";
import { AddItemUrgent1740000000002 } from "./database/migrations/1740000000002-AddItemUrgent";
import { DropEmailConfirmation1740000000001 } from "./database/migrations/1740000000001-DropEmailConfirmation";
import { Init1740000000000 } from "./database/migrations/1740000000000-Init";
import { AppReleaseController } from "./app-release.controller";
import { HealthController } from "./health.controller";
import { HomeMember } from "./modules/homes/home-member.entity";
import { Home } from "./modules/homes/home.entity";
import { HomesModule } from "./modules/homes/homes.module";
import { CustomCategory } from "./modules/items/custom-category.entity";
import { HiddenCategory } from "./modules/items/hidden-category.entity";
import { Item } from "./modules/items/item.entity";
import { ShoppingList } from "./modules/items/shopping-list.entity";
import { Staple } from "./modules/items/staple.entity";
import { ItemsModule } from "./modules/items/items.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { PushToken } from "./modules/notifications/push-token.entity";
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
            Staple,
            PushToken,
            CustomCategory,
            HiddenCategory,
          ],
          migrations: [
            Init1740000000000,
            DropEmailConfirmation1740000000001,
            AddItemUrgent1740000000002,
            AddPushTokens1740000000003,
            ShoppingTrip1740000000004,
            ManyHomes1740000000005,
            ItemSortOrder1740000000006,
            ShoppingLists1740000000007,
            CustomCategories1740000000008,
            ItemCosts1740000000009,
          ],
          migrationsRun: true,
        };
      },
    }),
    AuthModule,
    HomesModule,
    ItemsModule,
    NotificationsModule,
  ],
  controllers: [HealthController, AppReleaseController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
