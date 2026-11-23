import { plainToInstance, Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from "class-validator";

enum NodeEnv {
  Development = "development",
  Test = "test",
  Production = "production",
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @MinLength(1)
  DATABASE_URL: string;

  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_TTL = "15m";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  JWT_REFRESH_TTL_DAYS = 90;

  @IsString()
  CORS_ORIGINS = "";

  @IsOptional()
  @IsIn(["true", "false"])
  DATABASE_SSL = "false";

  @IsOptional()
  @IsString()
  APP_MIN_VERSION = "";

  /** Newest released version. Older installs get an optional "update or later" prompt. */
  @IsOptional()
  @IsString()
  APP_LATEST_VERSION = "";

  @IsOptional()
  @IsString()
  APP_DOWNLOAD_URL = "";

  /** OAuth Web client ID; Google ID tokens from the app are issued for it. */
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID = "";

  /** Brevo transactional email. Without a key, codes are only logged. */
  @IsOptional()
  @IsString()
  BREVO_API_KEY = "";

  @IsOptional()
  @IsString()
  MAIL_FROM_EMAIL = "";

  @IsOptional()
  @IsString()
  MAIL_FROM_NAME = "One More Thing";

  /**
   * Shared secret for POST /api/internal/pins/run. An outside scheduler calls it
   * so due pins arrive (and notify) even after the free server went to sleep.
   * Empty disables the endpoint.
   */
  @IsOptional()
  @IsString()
  CRON_SECRET = "";

  /** Optional: Expo "enhanced push security" access token. */
  @IsOptional()
  @IsString()
  EXPO_ACCESS_TOKEN = "";

  /**
   * Where photos are kept:
   * - "db": inside Postgres, as before (the default until object storage is set up)
   * - "fs": a folder on this machine (development and tests)
   * - "s3": an S3-compatible bucket such as Cloudflare R2 (production)
   */
  @IsOptional()
  @IsIn(["db", "fs", "s3"])
  STORAGE_DRIVER: "db" | "fs" | "s3" = "db";

  /** Folder for the "fs" driver. */
  @IsOptional()
  @IsString()
  STORAGE_DIR = ".storage";

  /** For "s3", e.g. https://<account id>.r2.cloudflarestorage.com */
  @IsOptional()
  @IsString()
  S3_ENDPOINT = "";

  /** "auto" for Cloudflare R2. */
  @IsOptional()
  @IsString()
  S3_REGION = "auto";

  @IsOptional()
  @IsString()
  S3_BUCKET = "";

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID = "";

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY = "";
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.map((error) => Object.values(error.constraints ?? {}).join(", ")).join("; "));
  }
  if (validated.STORAGE_DRIVER === "s3") {
    const missing = (["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const).filter(
      (key) => !validated[key],
    );
    if (missing.length > 0) throw new Error(`STORAGE_DRIVER=s3 needs ${missing.join(", ")}`);
  }
  return validated;
}

export type AppConfig = EnvironmentVariables;
