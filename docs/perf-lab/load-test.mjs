// Step 12 load test: virtual phones against the LOCAL API running on the lab database.
// Never point this at production.
//
// Why a script and not `postman performance run`: the Postman CLI's performance
// runner needs a Postman account login (it answers "No authorization data found.
// Please use the `postman login` command"). This script does the same job with
// Node's built-in fetch and no packages. The Postman collection next to it
// (load-smoke.postman_collection.json) checks the same three requests once, with
// assertions, using `postman collection run`, which works without a login.
//
// Usage (see README.md for the full sequence):
//   JWT_ACCESS_SECRET=<the secret the local API runs with> \
//   node docs/perf-lab/load-test.mjs <changes|history|bought|all> [seconds]
//
// Environment:
//   API_URL            default http://127.0.0.1:3997/api
//   JWT_ACCESS_SECRET  required, same value the API was started with
//   PSQL               command that runs psql on omt_perf
//                      default "docker exec -i backend-db-1 psql -U omt -d omt_perf"
//   OUT                optional path: raw timings are written there as JSON
//
// Pass mark (spec section 8): no errors, and 95% of requests under 200 ms.

import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://127.0.0.1:3997/api";
const SECRET = process.env.JWT_ACCESS_SECRET;
const PSQL = process.env.PSQL ?? "docker exec -i backend-db-1 psql -U omt -d omt_perf";
const scenario = process.argv[2] ?? "all";
const seconds = Number(process.argv[3] ?? 60);
if (!SECRET || SECRET.length < 16) throw new Error("Set JWT_ACCESS_SECRET to the local API's secret");
if (!["changes", "history", "bought", "all"].includes(scenario)) throw new Error(`Unknown scenario ${scenario}`);

// ---------- access tokens: the same payload and signature the API's auth service makes ----------

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function accessToken(userId, email) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub: userId, email, iat: now, exp: now + 3600 });
  const signature = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}

// ---------- the lab phones (made by load-setup.sql) ----------

const csv = execSync(`${PSQL} -At -F, -c "select scenario, home_id, user_id, email from lab_load order by n"`, {
  encoding: "utf8",
});
const phones = csv
  .trim()
  .split("\n")
  .map((line) => {
    const [kind, homeId, userId, email] = line.split(",");
    return { kind, homeId, userId, token: accessToken(userId, email) };
  });
const ofKind = (kind) => phones.filter((phone) => phone.kind === kind);

// ---------- timing ----------

const results = new Map(); // label -> { ms: number[], at: number[], errors: Map<string, number> }
function record(label, ms, error) {
  const entry = results.get(label) ?? { ms: [], at: [], errors: new Map() };
  entry.ms.push(ms);
  entry.at.push(Date.now());
  if (error) entry.errors.set(error, (entry.errors.get(error) ?? 0) + 1);
  results.set(label, entry);
}

async function call(label, phone, method, path, body) {
  const started = performance.now();
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${phone.token}`,
        "x-timezone": "Asia/Amman",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const ms = performance.now() - started;
    if (!response.ok) {
      record(label, ms, `HTTP ${response.status} ${text.slice(0, 80)}`);
      return null;
    }
    record(label, ms);
    return text ? JSON.parse(text) : null;
  } catch (error) {
    record(label, performance.now() - started, String(error?.cause?.code ?? error?.message ?? error));
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms) => ms * (0.8 + Math.random() * 0.4);
let stopAt = 0;
const running = () => Date.now() < stopAt;

// ---------- warm-up: every phone opens the app once (a full copy), not timed in the steady numbers ----------

async function warmUp(list) {
  const queue = [...list];
  const workers = Array.from({ length: 20 }, async () => {
    for (let phone = queue.shift(); phone; phone = queue.shift()) {
      const answer = await call("warm-up: full copy (first open)", phone, "GET", `/homes/${phone.homeId}/changes`);
      phone.version = answer?.version ?? 0;
      phone.needed = (answer?.items ?? []).filter((item) => item.status === "needed").map((item) => item.id);
    }
  });
  await Promise.all(workers);
}

// ---------- scenarios ----------

/** (a) A phone on a trip screen asks "what changed" every 3 s. */
async function changesPhone(phone) {
  await sleep(Math.random() * 3000); // phones do not all tick together
  while (running()) {
    const started = Date.now();
    const answer = await call("changes: every 3 s", phone, "GET", `/homes/${phone.homeId}/changes?since=${phone.version}`);
    if (answer) {
      if (answer.version !== phone.version) record("changes: answers with rows", 0);
      phone.version = answer.version;
    }
    await sleep(Math.max(0, 3000 - (Date.now() - started)));
  }
}

/** While (a) runs, someone in one of those homes buys an item every 2 s. */
async function changesWriter(list) {
  while (running()) {
    const phone = list[Math.floor(Math.random() * list.length)];
    const itemId = phone.needed?.shift();
    if (itemId) await call("changes: background purchase", phone, "POST", `/items/${itemId}/bought`, {});
    await sleep(2000);
  }
}

/** (b) A phone pages History: a month, page after page by cursor, ~1 s apart. */
async function historyPhone(phone) {
  await sleep(Math.random() * 1000);
  const now = new Date();
  while (running()) {
    const back = Math.floor(Math.random() * 12); // any kept month
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const month = date.toISOString().slice(0, 7);
    let before = null;
    do {
      const query = `month=${month}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
      const answer = await call("history: purchases page", phone, "GET", `/homes/${phone.homeId}/history/purchases?${query}`);
      before = answer?.next ?? null;
      await sleep(jitter(1000));
    } while (before && running());
  }
}

/** (c) A phone in a shop marks an item bought about once a second, half of them with a price. */
async function boughtPhone(phone) {
  await sleep(Math.random() * 1000);
  while (running()) {
    const itemId = phone.needed.shift();
    if (!itemId) {
      record("bought: ran out of needed items", 0);
      return;
    }
    const body = Math.random() < 0.5 ? { cost: Math.round(Math.random() * 20000) / 1000 } : {};
    await call("bought: mark bought", phone, "POST", `/items/${itemId}/bought`, body);
    await sleep(jitter(1000));
  }
}

// ---------- run ----------

const want = (kind) => scenario === "all" || scenario === kind;
const changes = want("changes") ? ofKind("changes") : [];
const history = want("history") ? ofKind("history") : [];
const bought = want("bought") ? ofKind("bought") : [];

console.log(`API ${API}, scenario ${scenario}, ${seconds} s`);
console.log(`phones: changes ${changes.length}, history ${history.length}, bought ${bought.length}`);
await warmUp([...changes, ...bought]);

stopAt = Date.now() + seconds * 1000;
const tasks = [
  ...changes.map(changesPhone),
  ...(changes.length ? [changesWriter(changes)] : []),
  ...history.map(historyPhone),
  ...bought.map(boughtPhone),
];
await Promise.all(tasks);

// ---------- report ----------

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const rows = [];
let pass = true;
for (const [label, { ms, errors }] of results) {
  const counter = label.startsWith("changes: answers") || label.startsWith("bought: ran out");
  if (counter) {
    rows.push({ label, requests: ms.length, p50: "", p95: "", max: "", under200: "", errors: "" });
    continue;
  }
  const sorted = [...ms].sort((a, b) => a - b);
  const under = sorted.filter((value) => value < 200).length / sorted.length;
  const errorCount = [...errors.values()].reduce((a, b) => a + b, 0);
  const gated = !label.startsWith("warm-up");
  if (gated && (errorCount > 0 || under < 0.95)) pass = false;
  rows.push({
    label,
    requests: sorted.length,
    p50: pct(sorted, 50).toFixed(1),
    p95: pct(sorted, 95).toFixed(1),
    max: sorted[sorted.length - 1].toFixed(1),
    under200: `${(under * 100).toFixed(1)}%`,
    errors: errorCount,
  });
  for (const [error, count] of errors) console.log(`  ${label}: ${count} x ${error}`);
}
console.table(rows);
// Timeline: p95 per 10-second window, to see whether a slow stretch is steady or a passing hiccup.
const startedAt = stopAt - seconds * 1000;
for (const [label, { ms, at }] of results) {
  if (label.startsWith("warm-up") || label.startsWith("changes: answers") || label.startsWith("bought: ran out")) continue;
  const windows = [];
  for (let i = 0; i < ms.length; i += 1) {
    const w = Math.max(0, Math.floor((at[i] - startedAt) / 10000));
    (windows[w] ??= []).push(ms[i]);
  }
  const line = windows.map((w) => (w ? Math.round(pct([...w].sort((a, b) => a - b), 95)) : "-")).join(" ");
  console.log(`p95 per 10 s, ${label}: ${line}`);
}
const steady = [...results].filter(([label]) => !label.startsWith("warm-up")).flatMap(([, r]) => r.ms);
console.log(`steady requests: ${steady.length} in ${seconds} s = ${(steady.length / seconds).toFixed(1)} per second`);
console.log(pass ? "PASS: no errors, 95% under 200 ms" : "FAIL: errors, or fewer than 95% under 200 ms");
if (process.env.OUT) {
  writeFileSync(process.env.OUT, JSON.stringify(Object.fromEntries([...results].map(([k, v]) => [k, v.ms]))));
}
process.exitCode = pass ? 0 : 1;
