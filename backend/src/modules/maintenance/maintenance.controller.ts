import { Controller, Headers, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { tokensMatch } from "../../common/crypto";
import { DomainError } from "../../common/domain.error";
import { JOB_LOCKS, JobLock } from "../../common/job-lock";
import type { AppConfig } from "../../config/env";
import { MaintenanceRunQueryDto } from "./maintenance.dto";
import { MaintenanceService } from "./maintenance.service";
import { ItemImagesService } from "../items/services/item-images.service";

/**
 * Called once a day by .github/workflows/maintenance.yml. Each call works for
 * about 20 seconds and says where to continue (`next`); the workflow calls
 * again with `after=<next>` until `next` is null.
 */
@SkipThrottle()
@Controller("internal/maintenance")
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly jobLock: JobLock,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly images: ItemImagesService,
  ) {}

  private assertSecret(secret: string | undefined) {
    const expected = this.config.get("CRON_SECRET", { infer: true })?.trim();
    if (!expected || !secret || !tokensMatch(secret, expected)) {
      throw new DomainError("NOT_FOUND", "Not found", HttpStatus.NOT_FOUND);
    }
  }

  /**
   * One-off after object storage is set up: moves photos kept in Postgres to
   * storage, 50 per call, each checked after writing. Call until `remaining` is 0.
   */
  @Post("copy-photos")
  @HttpCode(HttpStatus.OK)
  copyPhotos(@Headers("x-cron-secret") secret: string | undefined) {
    this.assertSecret(secret);
    return this.images.copyToStorage(50);
  }

  @Post("run")
  @HttpCode(HttpStatus.OK)
  async run(@Headers("x-cron-secret") secret: string | undefined, @Query() query: MaintenanceRunQueryDto) {
    this.assertSecret(secret);
    let result = null;
    const ran = await this.jobLock.runExclusive(JOB_LOCKS.maintenance, async () => {
      result = await this.maintenance.run(query.after ?? null);
    });
    return ran ? result : { busy: true, next: query.after ?? null };
  }
}
