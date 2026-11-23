import { EventEmitter } from "node:events";
import { describe, expect, it, jest } from "@jest/globals";
import { HealthController } from "../health.controller";
import { JobLock } from "./job-lock";
import { requestLog, routeOf } from "./request-log";

describe("requestLog", () => {
  it("writes one line with the route pattern, status and time when the response finishes", () => {
    const lines: string[] = [];
    const req = { method: "GET", baseUrl: "", route: { path: "/api/homes/:homeId/items" } };
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const next = jest.fn();

    requestLog((line) => lines.push(line))(req as never, res as never, next);
    expect(next).toHaveBeenCalled();
    expect(lines).toHaveLength(0);

    res.emit("finish");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^req GET \/api\/homes\/:homeId\/items 200 \d+ms$/);
  });

  it("names unmatched requests instead of logging their path", () => {
    expect(routeOf({ baseUrl: "", route: undefined } as never)).toBe("(unmatched)");
  });
});

describe("HealthController", () => {
  const response = () => {
    const res = { statusCode: 200, status: jest.fn((code: number) => { res.statusCode = code; return res; }) };
    return res;
  };

  it("is healthy when the database answers", async () => {
    const dataSource = { query: jest.fn(async () => [{ "?column?": 1 }]) };
    const res = response();
    await expect(new HealthController(dataSource as never).check(res as never)).resolves.toEqual({ ok: true });
    expect(res.statusCode).toBe(200);
  });

  it("answers 503 when the database does not", async () => {
    const dataSource = { query: jest.fn(async () => { throw new Error("connection refused"); }) };
    const res = response();
    await expect(new HealthController(dataSource as never).check(res as never)).resolves.toEqual({ ok: false });
    expect(res.statusCode).toBe(503);
  });
});

describe("JobLock", () => {
  /** A fake Postgres that hands each advisory lock to one connection at a time. */
  function fakeDatabase() {
    const held = new Set<number>();
    const released: number[] = [];
    const dataSource = {
      createQueryRunner: () => ({
        connect: async () => undefined,
        release: async () => { released.push(1); },
        query: async (sql: string, [id]: number[]) => {
          if (sql.includes("pg_try_advisory_lock")) {
            if (held.has(id)) return [{ locked: false }];
            held.add(id);
            return [{ locked: true }];
          }
          held.delete(id);
          return [{ unlocked: true }];
        },
      }),
    };
    return { dataSource, held, released };
  }

  it("lets only one of two overlapping runs do the work", async () => {
    const { dataSource, held } = fakeDatabase();
    const lock = new JobLock(dataSource as never);
    let finishFirst!: () => void;
    const work = jest.fn(() => new Promise<void>((resolve) => { finishFirst = resolve; }));

    const first = lock.runExclusive(7001, work);
    await new Promise((resolve) => setImmediate(resolve));
    const second = await lock.runExclusive(7001, work);

    expect(second).toBe(false);
    finishFirst();
    await expect(first).resolves.toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(held.size).toBe(0);
  });

  it("releases the lock and the connection when the work throws", async () => {
    const { dataSource, held, released } = fakeDatabase();
    const lock = new JobLock(dataSource as never);
    await expect(lock.runExclusive(7002, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(held.size).toBe(0);
    expect(released).toHaveLength(1);
    await expect(lock.runExclusive(7002, async () => undefined)).resolves.toBe(true);
  });
});
