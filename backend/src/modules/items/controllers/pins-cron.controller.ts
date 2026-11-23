import { Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { DomainError } from "../../../common/domain.error";
import { JOB_LOCKS, JobLock } from "../../../common/job-lock";
import { tokensMatch } from "../../../common/crypto";
import type { AppConfig } from "../../../config/env";
import { NotificationsService } from "../../notifications/services/notifications.service";
import { ItemsService } from "../services/items.service";
import { PinsService } from "../services/pins.service";

/**
 * Called by an outside scheduler (GitHub Actions, see .github/workflows/pins-tick.yml).
 * On Render's free plan the server sleeps when idle, which stops the in-process
 * timer; this request wakes it and adds every due pin (and returns every due Later item) right away.
 */
@SkipThrottle()
@Controller("internal")
export class PinsCronController {
  constructor(
    private readonly pins: PinsService,
    private readonly items: ItemsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jobLock: JobLock,
  ) {}

  @Post("pins/run")
  @HttpCode(HttpStatus.OK)
  async run(@Headers("x-cron-secret") secret: string | undefined) {
    const expected = this.config.get("CRON_SECRET", { infer: true })?.trim();
    if (!expected || !secret || !tokensMatch(secret, expected)) {
      throw new DomainError("NOT_FOUND", "Not found", HttpStatus.NOT_FOUND);
    }
    let ran = false;
    try {
      // If the server's own timer is running the same work right now, it is
      // not done twice: this request only wakes the server and sends notices.
      ran = await this.jobLock.runExclusive(JOB_LOCKS.pins, async () => {
        await this.pins.materializeDueHomes();
        await this.items.releaseDueLater();
      });
    } finally {
      // Send the "back on the list" notices before the server can fall asleep
      // again, also for whatever was added before something failed.
      await this.notifications.flushPending();
    }
    return { ok: true, ran };
  }
}
