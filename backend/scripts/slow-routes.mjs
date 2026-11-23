#!/usr/bin/env node
// Reads a saved server log and prints, per route: requests, median and 95th
// percentile time, slowest time, and how many answered with an error.
//
//   node scripts/slow-routes.mjs render-log.txt
//   cat render-log.txt | node scripts/slow-routes.mjs
//
// It understands the lines written by src/common/request-log.ts:
//   req GET /api/homes/:homeId/items 200 12ms
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const LINE = /\breq (\S+) (\S+) (\d{3}) (\d+)ms\b/;
const input = process.argv[2] ? createReadStream(process.argv[2]) : process.stdin;
const routes = new Map();

for await (const line of createInterface({ input })) {
  const match = LINE.exec(line);
  if (!match) continue;
  const [, method, route, status, ms] = match;
  const key = `${method} ${route}`;
  const entry = routes.get(key) ?? { times: [], errors: 0 };
  entry.times.push(Number(ms));
  if (Number(status) >= 500) entry.errors += 1;
  routes.set(key, entry);
}

const pick = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
const rows = [...routes].map(([route, { times, errors }]) => {
  const sorted = [...times].sort((a, b) => a - b);
  return { route, count: sorted.length, p50: pick(sorted, 0.5), p95: pick(sorted, 0.95), max: sorted.at(-1), errors };
});
rows.sort((a, b) => b.p95 - a.p95);

if (rows.length === 0) {
  console.log("No request lines found.");
} else {
  console.table(rows.map((row) => ({
    route: row.route,
    requests: row.count,
    "median ms": row.p50,
    "p95 ms": row.p95,
    "max ms": row.max,
    "5xx": row.errors,
  })));
}
