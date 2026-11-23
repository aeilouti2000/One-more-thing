# Build progress: performance refactor

Branch `perf-refactor`, merged into `main` and deployed on 2026-11-23 (see "Release 2.9.3" at the end). One commit per finished step.

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
| 19 SQLite tables (cut line) | Done, tested on an emulator (see "Release 2.9.3") | The saved copy moves from one text to tables: item/product/trip lists one row per entry (only changed objects are written), small entries one row each, pending changes one row each. First start moves the old text into the tables before removing it. Falls back to the old text if SQLite can't open (web, tests). 8 tests on real SQLite (`node:sqlite`). Screens still read the same in-memory cache |
| 11b Icons on the server | Done | Migration 031 `home_icons`; emoji or 192 px WebP image per category or shop name; `GET/PUT/DELETE /homes/:id/icons`, `PUT …/icons/image`, `GET /icons/:imageId`; icons in the changes answer; trash and category-delete triggers. 7 end-to-end tests, 13 shared emoji cases |
| 12 Lab and load test | Done | Lab rebuilt through the migrations (027: 20 min 51 s, 028: ~3 min 50 s at 4.9 M purchases; production 0.19 s). A lab file per new query (`docs/perf-lab/s12-*.sql`). Found and fixed one missing index (migration 032, trip lookups by last purchase: 658 → 3 pages per purchase), with a test. Load test (Node script; Postman's performance runner needs a login, the Postman smoke collection passes): all scenarios pass, except 2 runs of mark bought slowed by other work on this machine. Results in the decision log, "Step 12 results" |

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
27. **Migration 032 `TripLastBoughtIndex`** (step 12): `trip_receipts (home_id, last_bought_at desc)`. Finding the open trip on every purchase read every trip of the home (658 pages in the lab; 3 with the index); the changes endpoint's trip read too (655 → 105). A new migration rather than a change to 027, because development and rehearsal databases already ran 027.

## Release 2.9.3 (2026-11-23)

The owner asked for a strict test of everything, then the release. What was checked, in order:

**Automatic checks, on the released commit `03db8ed`**

- Backend: 125 unit tests; 73 database tests on Postgres 16 and again on Postgres 18 (production's version).
- App: 153 tests, type-check and lint clean.

**Production data, on a private copy** (fresh backup `~/omt-release-backup/prod-before-2.9.3-20261123-2158.dump`, restored into a throwaway Postgres 18, push tokens deleted first so no phone could be notified)

- The old server and the new server were asked the same questions for all 18 homes. The 399 items, lists, pins, sets, categories and questions came back identical through the endpoints 2.9.2 uses. One difference, on purpose: two items created in the same millisecond now always come in the same order (tie broken by id).
- Month totals from the new History endpoints equal the app's own rule in 16 of 16 home-months.
- All 255 purchases that had no trip got one. Migrations plus start-up took 0.86 s.
- The clean-up job deleted nothing except 10 expired sign-in tokens.

**The app on a throwaway emulator** (Expo Go, local backend): sign-up, sync and order, History (ring, month arrows, category bar, an older month from the server), Invoices and a trip, a shop icon, adding offline then force-stop then reopen then reconnect (sent once), the SQLite file read directly (rows as expected), an upgrade from a 2.9.2 saved copy with a change waiting (moved into tables, sent once), and a change the server refuses (the phone says so and goes back to the server's state).

**Two independent reviews** of the whole change found one blocker (a refused change was never rolled back on the phone) and a list of smaller problems; all fixed in `03db8ed` with tests, except "retry once on a database deadlock" (rare, the phone already retries).

**Release**

- `main` fast-forwarded to `03db8ed` and pushed; Render deploy `dep-dc29ccjm8hqs73b6dro0` live at 19:39 UTC.
- Production after the deploy: 33 migrations, 399 items, 72 trips, 230 products, 18 homes on the `early` plan, 0 purchases without a trip, no errors and no 5xx in the logs.
- Photos stay in the database (`STORAGE_DRIVER` not set) until the owner creates the R2 bucket.
- APK 2.9.3 (versionCode 51, EAS build `f2a5c4eb`, built from `03db8ed`): https://expo.dev/artifacts/eas/ymPkuJMaiF15cppMBmcas8qzsIXVVNNNrF0iO5-Bs74.apk
- That exact APK was installed on the throwaway emulator and tried against production with a test account (no email): log in, create a home, add, buy, History, cold start, add while offline then kill and reopen (kept, sent once after reconnecting). The test account and its home were deleted afterwards; production is back to 25 users, 18 homes, 399 items.
- Render: `APP_LATEST_VERSION=2.9.3` and `APP_DOWNLOAD_URL` set to the new APK (deploy `dep-dc2a6s6tlv9c73cpkjhg`). `APP_MIN_VERSION` stays 2.6.0, so the update is offered, not forced.

Still open after the release: the A52 before/after measurements (steps 1 and 18), the uptime monitor, the R2 bucket and photo copy, closing the database to the public internet, and the clean-up migration (step 25) once nobody is on 2.9.2.

## History period (2026-11-24)

Branch `history-period` from `main` (`7dd6062`), built in a separate checkout (`../One-more-thing-history-period`) so the uncommitted toast work in the main checkout stays untouched. Spec: `docs/history-period-spec.md`, mockup: `docs/history-period-mockup.html`. Not pushed, not merged, nothing deployed or released.

**What was built**

- Backend: migration 033 `HistoryPeriod` (three columns on `homes`, existing homes get `before = 12` and a change date of the migration, new homes 3 and nothing waiting); `modules/plans/history-period.ts` (`historyPeriodOf`, plus `historyChange`, the 4.3 rule as a pure function); `history` in every home answer (so also in the changes answer); `PATCH /api/homes/:homeId/history-settings` (host only, `ONLY_HOST_CAN_UPDATE_HISTORY`; above the plan `HISTORY_PERIOD_LIMIT`, 409 like `SET_LIMIT`), reading and writing under a row lock; History (`access()`, so purchases, search, trips, months list, month totals) and the clean-up job read the period in force. `GRACE_DAYS` now reads `HISTORY_NOTICE_DAYS`.
- App: `history` on `Household` (missing from an older server: the row and screen are hidden); `home.historySettings` change through the outbox, with the server's rule mirrored (`features/homes/utils/history-period.ts`); "History" row in Home settings; `/settings/history` screen (chips, never-removed card, waiting notice with "Keep N months", confirmation sheet when shortening, locked pill for others); registered in the settings stack and the tablet nav list; the notice at the top of Purchases (closable, remembered per waiting change; "Change" for the host, "Only the host can change this" for others); "Keep more months" under a cleaned month for the host; English and Arabic texts; App features entry (`since: "2.9.3"`, as it ships by OTA on 2.9.3) and What's new line `whatsNew8`; `whatsNew7` no longer says "History keeps the last 12 months".

**Tests**

- Backend `npm test`: 135 passed (10 new in `history-period.spec.ts`).
- Backend `npm run test:db` (Postgres 16, local Docker): 85 passed (12 new: `history-settings.db-spec.ts` 7, clean-up 2, History 2, migration 1).
- App: `npm run test` 161 passed (8 new), `npm run lint` clean, `npm run typecheck` clean.
- On a throwaway headless emulator (deleted afterwards; Expo Go, the branch's backend on a throwaway database, also deleted): Home settings row, the screen, the sheet (Sept 1 / Dec 24, correct), saving (server columns 3 / 12 / date), the notice in History, closing it (stays closed, comes back for a new change), "Keep more months" on an archived month, lengthening without a sheet, and the non-host views. Not checked on screen: Arabic, dark mode, tablet split.

**Differences from the spec, and why**

1. **Migration 033 does not use `omt.skip_sync`.** The `homes_version` trigger (migration 025, `omt_home_version`) bumps a home's version on every update of the row and does not read `omt.skip_sync`, so it would bump anyway. The bump is useful: every phone's next changes answer carries the home with its `history`. Because of this, the TripsAsRows migration test (which checked that 027 bumps nothing) now migrates only up to 032.
2. **Messages use `ToastMessage`** (the app-wide message card), switched when the branch was merged with that work; on the branch alone it used `FormMessage`, since `ToastMessage` was not on `main` yet.
3. **Dates follow the app's existing English format** ("Dec 24", "September 1"), like the other History dates (`Intl` with `en`), not the mockup's "24 Dec" / "1 September".
4. **History notice wording** follows the mockup ("Purchases before September 1 will be removed. Each month's totals stay.") rather than the spec's shorter "Older purchases will be removed; month totals stay.", so it names the day like the settings notice and the sheet. The settings card is titled "Never removed" (mockup) rather than "What is never removed" (spec).
5. **A waiting change whose date has passed counts as applied on the phone** (`historyNow`), even if the phone has not heard from the server since: nothing on the server changes on that date, so no new answer would come.
6. **The other members get the change the way cost settings reach them**: the server bumps the home's version; the app refreshes the home on foreground and after its own changes (the app does not read `home` from the changes answer, for any setting).
7. **Shortening again during a notice restarts the 30 days** (spec 4.3 as written: `before` = the period in force, `changed_at = now()`). Safe, and it can only delay a deletion.
8. **No "NEW" tag on the Home settings row**: the mockup shows one, but `SettingsLinkCard` has no tag and the spec doesn't ask for it; App features tags the feature "New" (since 2.9.3).

**Release state**

- Merged into `main` as one commit on 2026-11-24 and published by OTA on runtime 2.9.3 (no version bump: `runtimeVersion` follows the app version, so a bump would cut 2.9.3 phones off the update).
- The backend is not deployed: until it is, the server sends no `history`, so the app hides the setting and the notice. To turn it on: rehearse migration 033 on a fresh private copy of production (push tokens deleted first), then deploy. The 30-day notice for existing homes starts when 033 runs.
