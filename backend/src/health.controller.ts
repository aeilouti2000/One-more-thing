import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { DataSource } from "typeorm";

/**
 * Render calls this to decide whether the server is healthy, and the uptime
 * monitor calls it every few minutes (which also keeps the free server awake).
 * It asks the database a trivial question, so "healthy" means the server can
 * actually answer requests, not only that the process is running.
 */
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      await this.dataSource.query("select 1");
      return { ok: true };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { ok: false };
    }
  }
}
