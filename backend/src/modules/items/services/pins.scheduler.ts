import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PinsService } from "./pins.service";

const DUE_CHECK_MS = 60_000;

@Injectable()
export class PinsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PinsScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly pins: PinsService) {}

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
      await this.pins.materializeDueHomes();
    } catch (error) {
      this.logger.warn(
        `Could not add due pins: ${error instanceof Error ? error.message : "unknown"}`,
      );
    } finally {
      this.running = false;
    }
  }
}
