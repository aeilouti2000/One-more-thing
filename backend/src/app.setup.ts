import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import type { AppConfig } from "./config/env";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { requestLog } from "./common/request-log";

/** Everything main.ts sets on the app, shared with the API tests. */
export function configureApp(app: NestExpressApplication, options: { log?: boolean } = {}) {
  // Render's proxy is in front: take the client IP from X-Forwarded-For (one
  // hop), so rate limits apply per user instead of to everyone at once.
  app.set("trust proxy", 1);
  // One line per request: route, status, milliseconds (see common/request-log.ts).
  if (options.log !== false) app.use(requestLog());
  const config = app.get(ConfigService<AppConfig, true>);
  const origins = config
    .get("CORS_ORIGINS", { infer: true })
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // The legal pages live at the root (/, /privacy, /terms) for public links.
  app.setGlobalPrefix("api", { exclude: ["", "privacy", "terms"] });
  // Allow cross-origin browser clients (Expo web) to call the API.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.enableCors({ origin: origins.length > 0 ? origins : true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  return config;
}
