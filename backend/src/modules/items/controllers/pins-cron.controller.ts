import { Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { DomainError } from "../../../common/domain.error";
import { tokensMatch } from "../../../common/crypto";
import type { AppConfig } from "../../../config/env";
import { NotificationsService } from "../../notifications/services/notifications.service";
import { PinsService } from "../services/pins.service";

/**
 * Called by an outside scheduler (GitHub Actions, see .github/workflows/pins-tick.yml).
 * On Render's free plan the server sleeps when idle, which stops the in-process
 * timer; this request wakes it and adds every due pin right away.
 */
@SkipThrottle()
@Controller("internal")
export class PinsCronController {
  constructor(
    private readonly pins: PinsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Post("pins/run")
  @HttpCode(HttpStatus.OK)
  async run(@Headers("x-cron-secret") secret: string | undefined) {
    const expected = this.config.get("CRON_SECRET", { infer: true })?.trim();
    if (!expected || !secret || !tokensMatch(secret, expected)) {
      throw new DomainError("NOT_FOUND", "Not found", HttpStatus.NOT_FOUND);
    }
    await this.pins.materializeDueHomes();
    // Send the "back on the list" notices before the server can fall asleep again.
    await this.notifications.flushPending();
    return { ok: true };
  }
}
