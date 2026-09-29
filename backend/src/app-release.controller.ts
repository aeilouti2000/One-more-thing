import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import type { AppConfig } from "./config/env";

@SkipThrottle()
@Controller("app")
export class AppReleaseController {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  @Get("release")
  release() {
    const minVersion = this.config.get("APP_MIN_VERSION", { infer: true }).trim();
    const downloadUrl = this.config.get("APP_DOWNLOAD_URL", { infer: true }).trim();
    return {
      minVersion: minVersion || null,
      downloadUrl: downloadUrl || null,
    };
  }
}
