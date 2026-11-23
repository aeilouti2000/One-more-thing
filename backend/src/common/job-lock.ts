import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

/**
 * Numbers for Postgres advisory locks. Each scheduled job has its own, and a
 * number is never reused for something else.
 */
export const JOB_LOCKS = {
  pins: 7001,
  maintenance: 7002,
} as const;

/**
 * Runs a scheduled job in one server instance at a time.
 *
 * A timer fires in every running copy of the server. An advisory lock is a
 * named lock that Postgres keeps for us: the first instance to ask gets it,
 * the others get "no" straight away and skip this run. The lock belongs to
 * one database connection, so it is taken and released on the same one.
 * See https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
 */
@Injectable()
export class JobLock {
  constructor(private readonly dataSource: DataSource) {}

  /** Runs `work` and returns true, or returns false at once if another run holds the lock. */
  async runExclusive(lockId: number, work: () => Promise<void>): Promise<boolean> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const rows: { locked: boolean }[] = await runner.query(
        "select pg_try_advisory_lock($1) as locked",
        [lockId],
      );
      if (!rows[0]?.locked) return false;
      try {
        await work();
      } finally {
        await runner.query("select pg_advisory_unlock($1)", [lockId]);
      }
      return true;
    } finally {
      await runner.release();
    }
  }
}
