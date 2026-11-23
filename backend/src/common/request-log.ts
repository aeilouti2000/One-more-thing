import type { NextFunction, Request, Response } from "express";

/**
 * One line per request, written when the response is finished:
 *
 *   req GET /api/homes/:homeId/items 200 12ms
 *
 * The route is the pattern Express matched (`:homeId`, not the real id), so
 * lines can be grouped per endpoint and no ids end up in the log.
 * `scripts/slow-routes.mjs` reads these lines and prints the slowest routes.
 */
export function requestLog(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      write(`req ${req.method} ${routeOf(req)} ${res.statusCode} ${Math.round(ms)}ms`);
    });
    next();
  };
}

/** The matched route pattern, or a placeholder when nothing matched (a 404). */
export function routeOf(req: Pick<Request, "baseUrl" | "route">) {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof path !== "string") return "(unmatched)";
  return `${req.baseUrl ?? ""}${path}` || "/";
}
