import { Controller, Headers, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { tokensMatch } from "../../common/crypto";
import { DomainError } from "../../common/domain.error";
import { JOB_LOCKS, JobLock } from "../../common/job-lock";
import type { AppConfig } from "../../config/env";
import { MaintenanceRunQueryDto } from "./maintenance.dto";
import { MaintenanceService } from "./maintenance.service";

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
  ) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  async run(@Headers("x-cron-secret") secret: string | undefined, @Query() query: MaintenanceRunQueryDto) {
    const expected = this.config.get("CRON_SECRET", { infer: true })?.trim();
    if (!expected || !secret || !tokensMatch(secret, expected)) {
      throw new DomainError("NOT_FOUND", "Not found", HttpStatus.NOT_FOUND);
    }
    let result = null;
    const ran = await this.jobLock.runExclusive(JOB_LOCKS.maintenance, async () => {
      result = await this.maintenance.run(query.after ?? null);
    });
    return ran ? result : { busy: true, next: query.after ?? null };
  }
}
