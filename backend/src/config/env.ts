import { plainToInstance } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

enum NodeEnv {
  Development = "development",
  Test = "test",
  Production = "production",
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

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

  @IsInt()
  @Min(1)
  @Max(365)
  JWT_REFRESH_TTL_DAYS = 30;

  @IsInt()
  @Min(1)
  @Max(168)
  EMAIL_TOKEN_TTL_HOURS = 24;

  @IsString()
  APP_PUBLIC_URL = "http://localhost:3000";

  @IsString()
  CORS_ORIGINS = "";

  @IsOptional()
  @IsString()
  SMTP_HOST = "";

  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT = 587;

  @IsOptional()
  @IsString()
  SMTP_USER = "";

  @IsOptional()
  @IsString()
  SMTP_PASS = "";

  @IsString()
  SMTP_FROM = "One More Thing <noreply@localhost>";
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.map((error) => Object.values(error.constraints ?? {}).join(", ")).join("; "));
  }
  return validated;
}

export type AppConfig = EnvironmentVariables;
