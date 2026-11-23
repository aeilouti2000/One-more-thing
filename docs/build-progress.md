# Build progress: performance refactor

Branch `perf-refactor`, local only, never pushed. One commit per finished step.

Owner's instructions for this run (2026-11-23):

- Build and test everything locally. **Stop before production**: no deploy, no APK build, no Render change.
- Commit each step on this branch; do not push.
- Icon defaults kept: shop icon per shop name; emoji allowed beside upload; main Items rows unchanged.
- A local copy of production is in the Docker database `omt_prod` (dump in `/tmp/omt-prod/prod.dump`, delete when done). Use it to rehearse migrations. It holds personal data: never send it anywhere.

| Step | State | Notes |
| --- | --- | --- |
| 1 Baseline on the A52 | Waiting for the owner | |
| 2 Logs, health, job lock | Done | Request log, slow queries > 200 ms, health queries the DB (503 if not), advisory lock on pins scheduler and cron |
| 3 Wake-up every 5 min | Done | Owner still to set up the uptime monitor |
| 4 Migrations 025–029 | Done | Rehearsed on the production copy: 0.19 s; 72 trips, identical to the app's grouping; 230 products; versions untouched. `npm run test:db` (12 tests, needs local Postgres) |
| 5 Name key | Done | Server `nameKey` and app `normalizeName` checked against one shared list |
| 6 Changes endpoint | Done | `GET /api/homes/:homeId/changes?since=N`; 10 end-to-end tests on a throwaway database |

## Differences from the spec, decided during the build

These follow the spec's intent; the spec will be updated to match before the release.

1. **Small sets are sent whole** in every non-empty changes answer: home (with its members), lists, categories, pins, sets, asks, shop locks. Only items, products and trips are sent as changes. Simpler for the phone, and these sets are a few kilobytes at most. So `deleted` only lists items, products and trips.
2. **No separate `members` field**: the home already contains its members.
3. **Someone outside the home gets 403**, the existing rule everywhere in the API (the spec said 404).
4. **Expired shop locks are removed by the changes request** before answering. A lock ends by time, not by a write, so without this a phone would show a shopper forever.
5. **A trip that changes resends its items**, because item rows carry the trip's name and total.
6. **The trigger skips updates that change nothing**, so identical rows are never resent.
7. **Migrations now run one transaction each** (`migrationsTransactionMode: "each"`), needed for the index built "concurrently".
