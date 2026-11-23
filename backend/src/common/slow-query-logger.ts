import { Logger as NestLogger } from "@nestjs/common";
import type { Logger } from "typeorm";

/**
 * Logs queries slower than `maxQueryExecutionTime`, with their SQL but never
 * their parameters: those can be a whole photo, an email or a token hash.
 */
export class SlowQueryLogger implements Logger {
  private readonly logger = new NestLogger("Database");

  logQuerySlow(time: number, query: string) {
    this.logger.warn(`slow query ${time}ms: ${query.replace(/\s+/g, " ").slice(0, 600)}`);
  }

  logMigration(message: string) {
    this.logger.log(message);
  }

  logQuery() {}
  logQueryError() {}
  logSchemaBuild() {}
  log() {}
}
