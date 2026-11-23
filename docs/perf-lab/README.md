# Performance lab

A separate test database (`omt_perf`) in the local Docker Postgres, filled with fake data at the size of a large app, then brought up to date with the real migrations. The other databases (`omt`, `omt_prod`, `omt_rehearsal`) are never touched. Never point anything here at production.

| File | What it does |
| --- | --- |
| `seed.sql` | Empties `omt_perf` and fills it: 30,000 homes, about 5 million items. Takes about 2 minutes. |
| `d3-history.sql` | Design phase: one History page without and with its index. |
| `s12-changes.sql` | Step 12: the changes endpoint, query by query ("nothing changed", changed items, products, trips, deletion markers, full copy). Stamps a few dozen real changes in two homes the first time it runs. |
| `s12-history.sql` | Step 12: History purchases (page 1, by cursor, by category), search, trips page, month totals, months list. |
| `s12-writes.sql` | Step 12: what a purchase writes: finding the open trip, trip times, product upsert, product refresh on undo. Runs in `begin … rollback`. |
| `s12-cleanup.sql` | Step 12: the daily clean-up job's probe for one home, and one delete batch's select. |
| `s12-trip-index.sql` | Step 12: the index added by migration 032, without and with it. |
| `load-setup.sql` | Picks the 300 lab homes the virtual phones use (`lab_load`) and tops up needed items for the "mark bought" phones. Run before each load test. |
| `load-test.mjs` | The load test: 200 phones on changes, 50 paging History, 50 marking bought. Node 22, no packages. |
| `load-smoke.postman_collection.json` | The same three requests once, with assertions, for `postman collection run`. |

Results of step 12 are in `docs/performance-refactor-decisions.md`, section "Step 12 results".

## Build the lab through the migrations

The seed fills the tables as they are before migration 027; the migrations after it (trips as rows, products, plans, photos, icons, the trip index) then run on 5 million rows, as they would on a large production database. Run from the project root.

```sh
# 1. An empty database, and parallel query off (Docker's /dev/shm is 64 MB, and production's database has 0.1 CPU)
docker exec backend-db-1 psql -U omt -d postgres -c "drop database if exists omt_perf" -c "create database omt_perf"
docker exec backend-db-1 psql -U omt -d omt_perf -c "alter database omt_perf set max_parallel_workers_per_gather = 0" \
  -c "alter database omt_perf set max_parallel_maintenance_workers = 0"

# 2. The schema up to migration 026 (stops before 027)
cd backend
MIGRATE_UNTIL=TripsAsRows1740000000027 DATABASE_URL=postgres://omt:omt@localhost:5432/omt_perf \
  npx ts-node --transpile-only scripts/migrate.ts
cd ..

# 3. The fake data (about 2 minutes), then fresh statistics
docker exec -i backend-db-1 psql -q -U omt -d omt_perf < docs/perf-lab/seed.sql
docker exec backend-db-1 psql -U omt -d omt_perf -c "vacuum analyze"

# 4. The remaining migrations (about 25 minutes: 027 takes 21, 028 about 4)
cd backend
DATABASE_URL=postgres://omt:omt@localhost:5432/omt_perf npx ts-node --transpile-only scripts/migrate.ts
cd ..
docker exec backend-db-1 psql -U omt -d omt_perf -c "vacuum analyze"
```

Run only one copy of the migrations at a time. To see how far it is:

```sh
docker exec backend-db-1 psql -U omt -d omt_perf -Atc "select name from migrations order by id desc limit 1"
docker exec backend-db-1 psql -U omt -d omt_perf -c "select now() - query_start, left(query, 80) from pg_stat_activity where datname = 'omt_perf' and state = 'active'"
```

## Run a lesson

```sh
docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/s12-changes.sql
```

Each plan has two lines to read: `Buffers: shared hit=N read=M` (pages touched, 8 kB each; "read" came from disk) and `Execution Time`. Compare the pages with the rows on the plan's top line: a few pages per row is good; hundreds of pages for a handful of rows means rows are being read and thrown away (a missing or wrong index). The planner's choices depend on statistics, so run `vacuum analyze` after big changes.

## Run the load test (local API only)

```sh
# 1. A local secret for signing test tokens. Keep it out of the repository.
openssl rand -hex 24 > /tmp/omt-perf-jwt && chmod 600 /tmp/omt-perf-jwt

# 2. Build and start the API on a free port (not 3000), against the lab.
#    It runs any pending migrations on start, like production does.
cd backend && npm run build
PORT=3997 NODE_ENV=development DATABASE_URL=postgres://omt:omt@localhost:5432/omt_perf \
  JWT_ACCESS_SECRET=$(cat /tmp/omt-perf-jwt) CRON_SECRET=local CORS_ORIGINS= STORAGE_DRIVER=db \
  node dist/main.js > /tmp/omt-perf-api.log 2>&1 &
cd ..

# 3. Pick the phones and top up their needed items (run before every load test)
docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/load-setup.sql

# 4. Smoke test with the Postman CLI (one home, 6 requests, 19 assertions; no login needed)
read H U E <<<$(docker exec backend-db-1 psql -U omt -d omt_perf -At -F' ' \
  -c "select home_id, user_id, email from lab_load where scenario = 'history' order by n limit 1")
postman collection run docs/perf-lab/load-smoke.postman_collection.json \
  --env-var baseUrl=http://127.0.0.1:3997/api --env-var jwtSecret=$(cat /tmp/omt-perf-jwt) \
  --env-var homeId=$H --env-var userId=$U --env-var email=$E

# 5. The load test: changes | history | bought | all, and a duration in seconds
JWT_ACCESS_SECRET=$(cat /tmp/omt-perf-jwt) node docs/perf-lab/load-test.mjs all 120

# 6. The API's own view of the same run, per route
node backend/scripts/slow-routes.mjs /tmp/omt-perf-api.log

# 7. Stop the API and remove the secret
pkill -f "node dist/main.js"; rm /tmp/omt-perf-jwt
```

The script prints p50, p95 and max per kind of request, errors, and "p95 per 10 s" lines that show whether a slow stretch is steady or a passing hiccup. This machine is shared (emulators, other projects): if one window is slow and the rest are fine, check `vmstat 1` for a busy machine before blaming the API. Postman's own load runner (`postman performance run`) needs a Postman account login; the script exists because this machine has none.

Lab tokens: every lab user is signed in by signing an access token with the API's secret, in the payload the API makes (`{ sub: userId, email, iat, exp }`, HS256). Lab users have no passwords.

## Remove the test database (frees about 5 GB)

```sh
docker exec backend-db-1 psql -U omt -d postgres -c "drop database omt_perf"
```
