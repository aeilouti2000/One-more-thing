import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { JOB_LOCKS, JobLock } from "../../../common/job-lock";
import { ItemsService } from "./items.service";
import { PinsService } from "./pins.service";

const DUE_CHECK_MS = 60_000;

@Injectable()
export class PinsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PinsScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly pins: PinsService,
    private readonly items: ItemsService,
    private readonly jobLock: JobLock,
  ) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), DUE_CHECK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Every server instance has this timer; the lock lets one of them do the work.
      await this.jobLock.runExclusive(JOB_LOCKS.pins, () => this.runDue());
    } catch (error) {
      this.logger.warn(
        `Could not run the pins tick: ${error instanceof Error ? error.message : "unknown"}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Adds due pins, then returns parked items whose day has come. Also used by the cron endpoint. */
  async runDue() {
    try {
      await this.pins.materializeDueHomes();
    } catch (error) {
      this.logger.warn(
        `Could not add due pins: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
    try {
      await this.items.releaseDueLater();
    } catch (error) {
      this.logger.warn(
        `Could not return Later items: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
