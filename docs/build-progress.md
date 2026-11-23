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
| 7 Trips and products on every purchase | Done | Buy, bulk buy, undo, price change, pricing a trip, moving and deleting keep trips and products right, in one transaction. Release-on-read removed. 11 end-to-end tests |
| 8 History endpoints | Done | Purchases (month, list, category, search, cursor), trips, one trip, month totals, months list. 11 end-to-end tests |
| 9 Plans | Done | `early` plan (12 months, sets 20, pins 15, 100 icon images); every home response carries `plan`; sets and pins read their limits from it |
| 10 Clean-up job | Done | `POST /api/internal/maintenance/run` (cron secret, advisory lock, ~20 s per call, `next` to continue) and `.github/workflows/maintenance.yml` daily at 01:30 UTC. Also removes old deletion markers (raising `sync_floor`), expired tokens and codes, finished questions. 6 end-to-end tests |
| 11 Photo storage | Done | Storage layer (`db` default / `fs` / `s3`), two sizes + thumbhash, redirect to a signed address, migration 030, copy endpoint, storage trash. 7 photo tests in both modes. Packages: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `thumbhash` (approved) |
| 15b + 15 Icons and History screens (app) | Done (helper 2, merged) | Icons: `features/icons`, `HomeIcon`, `IconSheet`, Categories settings, filter and form chips, trip cards and trip header, move-to-trip sheet, History rows without a photo. History: `components/history/` by month from the server, receipt cards, month hero and category bar, search, archive card, CSV paging, offline fallback for this month and last from the phone's items. 17 new tests |
| 13 App sync engine | Done | `features/sync`: one request per tick replaces the full item reload, the 3 s lock poll and the 15 s question poll; writes the existing cache entries in their shapes; version saved with the copy; falls back to the old endpoint on a 404. 8 merge tests. Not yet tried on a device |
| 14 Products and month totals in the app | Done | Suggestions, recent picks and last prices read the synced products (proven identical to the full-history results by a test); the recap card, recap screen and cost-settings export load months older than the phone's window from History. Spending summary, trip forecast and widget need no change: they only use this month and last |
| 16 Photos in the app | Done | Rows load the 256 px thumbnail (`?size=thumb`), viewers the full photo; thumbhash placeholder while loading. To check on a device: the image cache follows the redirect (the requested address is stable, so it should) |
| 17 Redraws and start-up | Done | Items context split into data and actions (`usePurchaseActions` for components that only act; the detail card uses it). Start-up already opens from the saved copy (session, household, items): no change needed. The four Readex Pro fonts are embedded at build time (`expo-font` plugin in `app.json`; needs the new APK), `useFonts` stays as the fallback |
| 19 SQLite tables (cut line) | Built, **needs a device test before it ships** | The saved copy moves from one text to tables: item/product/trip lists one row per entry (only changed objects are written), small entries one row each, pending changes one row each. First start moves the old text into the tables before removing it. Falls back to the old text if SQLite can't open (web, tests). 8 tests on real SQLite (`node:sqlite`). Screens still read the same in-memory cache |
| 11b Icons on the server | Done | Migration 031 `home_icons`; emoji or 192 px WebP image per category or shop name; `GET/PUT/DELETE /homes/:id/icons`, `PUT …/icons/image`, `GET /icons/:imageId`; icons in the changes answer; trash and category-delete triggers. 7 end-to-end tests, 13 shared emoji cases |

## Differences from the spec, decided during the build

These follow the spec's intent; the spec will be updated to match before the release.

1. **Small sets are sent whole** in every non-empty changes answer: home (with its members), lists, categories, pins, sets, asks, shop locks. Only items, products and trips are sent as changes. Simpler for the phone, and these sets are a few kilobytes at most. So `deleted` only lists items, products and trips.
2. **No separate `members` field**: the home already contains its members.
3. **Someone outside the home gets 403**, the existing rule everywhere in the API (the spec said 404).
4. **Expired shop locks are removed by the changes request** before answering. A lock ends by time, not by a write, so without this a phone would show a shopper forever.
5. **A trip that changes resends its items**, because item rows carry the trip's name and total.
6. **The trigger skips updates that change nothing**, so identical rows are never resent.
7. **Migrations now run one transaction each** (`migrationsTransactionMode: "each"`), needed for the index built "concurrently".
8. **Deleting a purchase leaves its product as it is** (count and last price), so suggestions keep it. Only undo takes a purchase back off its product.
9. **No "Scanned" tag on receipt cards**: a scanned receipt leaves no trace in the database (checked).
10. **No CSV export endpoint**: the CSV's column names are translated on the phone, so the app keeps building it from the month's purchases (`history/purchases` pages).
11. **A purchase belongs to the month its trip started** (the app's existing rule), for lists and totals alike, so they always agree.
12. **Month totals for months older than the plan keeps** are still shown (from saved totals, or summed while the purchases are in the grace period), marked `archived`.
13. **The clean-up job also removes expired sign-in tokens, email codes and finished shopping questions**, which nothing removed before.
14. **Every home's `plan_changed_at` starts at the deploy time**, so the job deletes nothing for the first 30 days. Nothing is older than 12 months before September 2027 anyway.
15. **Photos stay in the database until storage is configured**: `STORAGE_DRIVER` defaults to `db` (today's behaviour), so the backend can be deployed before the R2 bucket exists. Set `STORAGE_DRIVER=s3` plus the five S3 values to switch.
16. **No nightly bucket listing**: a trigger records the files of every deleted photo in `storage_trash`, and the daily job deletes exactly those. Cheaper and exact.
17. **Photo keys have a `photos/` folder**: `homes/<homeId>/photos/<imageId>/full.jpg` (icons go under `homes/<homeId>/icons/`).
18. **thumbhash is an ES-module-only package**: fine on Node 22.12+ (production image runs v22.23.4, checked); Jest converts it for tests.
19. **Icon images also work before storage is configured**: in `db` mode the 192 px WebP is kept in `home_icons.data`.
20. **Item rows carry `sortOrder`**: a changes answer can't carry list positions through array order, so the app sorts with the server's rule (place, then newest first).
21. **Helpers run in parallel** (owner's request): step 12 and steps 15b+15 are built by two helper threads in their own checkouts and merged into this branch when done.
22. **Lab migration time at scale**: migrations 027–031 took 24.7 minutes on the 5-million-item lab (027 rewrites every purchase). On production's 399 items they take 0.19 s, and they run once.
23. **SQLite: tables for the saved copy, not a new read layer.** Screens keep reading TanStack Query's in-memory cache; only saving changed (row-level writes, outbox rows). Same benefit for writes and start-up parsing, far less risk than rewriting every screen's reads.
24. **History offline fallback**: when this month's or last month's pages were never loaded, History builds them from the phone's own items (spec 5.2 asks that these two months always work offline).
25. **Emoji check without `Intl.Segmenter`** in the app: the phone's JavaScript engine (Hermes) may not support it; the app's check is tested against the same shared cases as the server's.
26. **`spending-summary.tsx` removed**: the month hero replaced it.
