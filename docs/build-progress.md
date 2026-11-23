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
