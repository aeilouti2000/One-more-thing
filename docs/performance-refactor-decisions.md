# One More Thing: performance refactor, decision log

This is the record of how each decision was reached: the audit, the measurements, the options compared, and the reading list. **What will be built is in [performance-refactor-spec.md](performance-refactor-spec.md).** Where the two differ, the spec is right; the differences are listed in the spec's section 2.

Discussed and decided on 2026-11-23.

## 1. Goal

Make the app fast, cheap to run and ready to grow to 1 million users, on both Android and iOS, and prepare it for paid plans (monthly, yearly, lifetime).

Rules for this work:

- The phone never downloads data it does not show.
- Every query the server runs often has an index that serves it.
- Every decision is discussed first, with reading material, and recorded in section 5.
- The output is this file: a spec detailed enough to implement from.

## 2. What the code does today (audit, 2026-11-23)

### 2.1 Reading data

| Finding | Where | Why it matters |
| --- | --- | --- |
| The list endpoint returns every item of the home, needed and bought, since the home was created. | `backend/src/modules/items/repo/items-repo/typeorm-items.repository.ts:16` (`findByHome`) | Response size grows forever. |
| During a shared trip the app re-reads that list every 3 seconds. | `frontend/features/items/api/shop-locks.ts:21`, `frontend/features/items/components/trip-screen.tsx:1155` | The whole history is sent again every 3 seconds per shopper. |
| History is filtered, searched, grouped into trips and summed on the phone. | `frontend/features/items/components/history-screen.tsx` | Needs the full history in memory. Blocks paging. |
| Recap and the spending summary are computed on the phone from the same full list. | `recap-card.tsx`, `spending-summary.tsx` | Same dependency on the full history. |
| No list on the phone is virtualized. Screens use a `ScrollView` and `.map()`. No `FlatList` or `FlashList` anywhere. | `frontend/components/ui/Screen.tsx:432` | Every row is rendered even when off screen. Slow with long lists, worst on older phones. |

### 2.2 Database

Postgres through TypeORM 0.3. Schema changes are hand-written SQL migrations that run when the server starts (`migrationsRun: true`).

Indexes that exist on `items`:

- `items_home_status_idx (home_id, status)`
- `items_list_created_idx (list_id, created_at)`
- `items_receipt_idx (receipt_id)`
- `items_later_until_idx` (partial, parked items only)

Missing for the queries we will need:

- Nothing serves "bought items of a home, newest first" (`home_id`, `bought_at`).
- `item_images` is indexed by `item_id` only, not by `home_id` or age.

### 2.3 Photos

- Stored as `bytea` in the `item_images` table, inside Postgres.
- Resized to 1280 px JPEG by `sharp` on the API server. One size only, no thumbnail.
- Served through the API (`GET /item-images/:imageId`) with a one-year immutable cache header.

Cost: photos fill the database, make backups large, and every photo download passes through the Node server.

### 2.4 Server

- NestJS 11 on Render's **free** plan: one instance, sleeps when idle.
- A GitHub Actions cron wakes it for due pins (`.github/workflows/pins-tick.yml`).
- State kept in server memory: the pins timer, `releasedOnReadAt`, the rate limiter. This breaks as soon as a second instance runs.
- No Redis, no job queue, no WebSocket or other push channel to the app. Freshness comes from polling.

### 2.5 App

- Expo SDK 58, React Native 0.88, React 19, NativeWind, Reanimated.
- TanStack Query with a persisted cache and `staleTime: Infinity`, plus an offline change queue.
- Distributed as an Android APK. No iOS build yet.

### 2.6 Production baseline (measured 2026-11-23, read-only queries)

| Measure | Value |
| --- | --- |
| Database size | 10 MB of a 1 GB disk |
| Users / homes | 25 / 18 (12 homes have items) |
| Items | 399 (336 bought, 63 needed) |
| Biggest home | 138 items, 128 of them bought, in 2 months |
| Homes buying something in a week | 2 to 5 |
| Purchases per week | about 50 |
| Photos | 8, average 98 kB, 785 kB in total (largest table: 896 kB) |
| Invoices (`trip_receipts`) | 19 |
| Largest home membership | 2 people |

Hosting:

- Database: Render Postgres 18, plan `0.1c-256mb` (0.1 CPU, 256 MB RAM, 1 GB disk), no connection pooler, region Oregon. It accepts connections from any IP address (`0.0.0.0/0`).
- API: Render web service, free plan, 1 instance, region Oregon. Render keeps no HTTP metrics on this plan, so request counts and response times are unknown.

What this means:

- Nothing is slow because of data size today. This work is design ahead of growth.
- Production is too small to test an index on. With 25 rows Postgres reads the whole table whatever indexes exist. Indexes must be tested on a seeded copy with realistic volume (workstream 9).
- `list_shop_locks` shows 14,168 full scans for a table with 0 live rows: the 3-second polling, visible in the statistics.

### 2.7 Everything that depends on the full history being on the phone

Splitting the list read (D1) removes the full history from the phone. Each of these needs a server-side replacement:

| Feature | Where | What it needs from history |
| --- | --- | --- |
| Name suggestions while typing | `add-item-card.tsx`, `utils/insights.ts` (`suggestItems`) | Every name ever bought, with its last price |
| Last known price | `trip-screen.tsx:267`, `sets-screen.tsx:130` (`lastPrices`) | Newest priced purchase per name |
| Saved shop names | `trip-screen.tsx:1350` (`savedShopNames`) | Names of past invoices |
| Month forecast during a trip | `trip-screen.tsx:298` (`summarizeMonth`) | This month's total |
| Spending summary, budget | `spending-summary.tsx` | Month totals |
| Monthly recap | `recap-card.tsx`, `utils/recap.ts` | A whole month, plus the month before |
| Invoices view | `utils/trips.ts` (`groupPurchasesIntoTrips`) | All purchases, grouped by invoice or by a 90-minute gap |
| History search | `history-screen.tsx` | Every purchase name |
| CSV export | `utils/insights.ts` (`purchasesToCsv`) | The filtered purchases |

## 3. Workstreams

Order matters: each one depends on the ones above it.

| # | Workstream | Main question |
| --- | --- | --- |
| 0 | Targets and measurement | What does "1 million users" mean in requests and rows, and how do we measure before and after? |
| 1 | Read paths | Which endpoints exist, what does each return, how is history paged? |
| 2 | Indexes | Which index serves each query from workstream 1? |
| 3 | Photos | Where do photos live and how do phones upload and download them? |
| 4 | Retention | How long is history kept per plan, and what summary survives? |
| 5 | Freshness | What replaces the 3-second polling? |
| 6 | Server and hosting | How does the server run on more than one instance? |
| 7 | Plans and entitlements | How do subscriptions work and how are features locked? |
| 8 | App performance | Virtualized lists, start-up time, iOS readiness. |
| 9 | Load testing and monitoring | How do we prove it holds? |
| 10 | Rollout | Order of releases, data migration, old app versions. |

Parked until workstream 1 is decided: the History and Invoices redesign (mockups shared in the thread on 2026-11-23).

## 4. Constraints already stated

- Retention has no "Never" option. Unlimited history costs too much.
- History is paged by the backend.
- Photos move out of Postgres.
- A subscription system (monthly, yearly, lifetime) is in scope. Some features will be locked to paid plans.
- The current server rejects unknown fields, so the backend deploys before the app.

## 5. Decision log

| # | Decision | Status | Chosen option | Date |
| --- | --- | --- | --- | --- |
| D0 | Scale targets and budget | Decided | 1 million **registered** accounts, 20% of homes active per month, users mostly in the Middle East. Principle: design for 1 million, pay for today's size; a bigger server is bought only when a measured number crosses a limit written in this spec. | 2026-11-23 |
| D1 | Split the list read from history; cursor paging | Decided | List endpoint returns needed items plus recently bought. History is a separate endpoint with cursor paging. Totals are computed by the server. | 2026-11-23 |
| D2 | Data model, and what stays on the phone | Decided | Hybrid: the rule and table in "D2 proposal". The phone keeps purchases of the current month and the month before. Three server tables: `home_products`, trips as rows, `home_month_stats`. | 2026-11-23 |
| D2a | Phone storage: one JSON text or SQLite tables | Decided | Move to SQLite tables, as the last app-side step (workstream 8), after the change-only sync exists. Until then the cache stays as it is, bounded by D2. | 2026-11-23 |
| D3 | Indexes | Decided | Add `items_home_bought_idx (home_id, bought_at desc, id desc) where status = 'bought'`. Sync and retention indexes follow in their workstreams. | 2026-11-23 |
| D2b | When `home_month_stats` is written | Decided | Live months are summed from `items`; the retention job writes a month's rows once, before deleting it. | 2026-11-23 |
| D4 | Photos | Decided | Cloudflare R2 (free tier). Upload through the API; two sizes (full 1280 px, thumb 256 px); a `thumbhash` placeholder; downloads straight from storage at a public address containing the random image id; files named by home. Revisit direct-to-storage uploads only if uploads become a measurable load on the API. | 2026-11-23 |
| D5 | Retention and plans | Decided | The home holds the plan. The mechanism is built now; until billing exists every home is on one plan with 12 months of history. Grace period: 30 days. The final limits and the list of paid features are set with the store release. | 2026-11-23 |
| D6 | Sync: how a phone learns what changed | Decided | A change counter per home (`homes.version`) stamped on every changed row; deletion markers kept 60 days; `GET /homes/:homeId/changes?since=`. Trigger: polling now, server-sent events later when a paid server and measured load justify it. | 2026-11-23 |
| D7 | Server and hosting | Decided | Keep the server awake with a request every 5 minutes until it is on a paid plan. Health check queries the database. Close the database to the public internet. Stateless: do the pins lock and remove "released on read" now; grouped notifications and rate limits move to shared storage when a second instance is needed. **Deferred by the owner:** the move to Frankfurt (runbook kept below) and a custom domain. | 2026-11-23 |
| D8 | App performance | Decided | Measure first on the slowest phone among current users (model to be named by the owner). Targets and order of work as in "D8". `FlatList` first; no new package unless a measurement requires it. | 2026-11-23 |
| D9 | Monitoring and load testing | Decided | As proposed in "D9". | 2026-11-23 |
| D10 | Rollout order | Decided | The phases are the build order. The app side ships once, in one new APK (2.9.3), not phase by phase. | 2026-11-23 |
| D11 | History and Invoices design | Decided | Purchases: "Month hero". Invoices: "Receipt cards". Animated mockup: `history-redesign-mockup.html`. | 2026-11-23 |

### D0 working numbers (assumptions, to confirm)

| Input | Value | Source |
| --- | --- | --- |
| Registered users | 1,000,000 | Decided |
| Users per home | 1.4, so about 700,000 homes | Measured (25 / 18) |
| Homes active in a month | 20%, so about 140,000 | Assumption. Today 2 to 5 of 18 homes buy in a week. |
| Purchases per active home per month | 60 | Measured (biggest home: 128 in 2 months) |
| Purchases per year | about 100 million | Calculated |
| Storage per purchase, with indexes | about 0.45 kB | Measured heap (220 B) plus an allowance for indexes |
| `items` growth with no retention | about 45 GB per year | Calculated |
| Purchases with a photo | 2% at 98 kB | Measured (8 of 399) |
| Photo growth | about 200 GB per year | Calculated |

### D2 proposal (decided 2026-11-23)

The phone holding data is not the problem. How it holds it today is:

- It downloads the whole history again on every read, not only what changed.
- It saves everything as one JSON text under one key (`omt.query.v1`, `frontend/features/offline/query-client.ts`), rewritten 250 ms after every change and parsed when the app starts.
- `items` rows have no `updated_at`, and a deleted row leaves no trace, so the server cannot answer "what changed since my last sync".

Rule: **the phone keeps what is small, bounded, and must be instant or work offline. The server keeps what grows forever or must be identical for every member.**

| Feature | Lives on | Reason |
| --- | --- | --- |
| Needed items | Phone, synced | The core screen; must work offline |
| Purchases of the current month and the month before | Phone, synced | Undo, the current trip, recent History offline |
| Name suggestions, last price | Phone, from a synced copy of `home_products` | Runs on every keystroke; a few hundred rows per home |
| Saved shop names | Phone, from synced trips of the recent window | Small |
| Month totals, budget, forecast, recap | Server (`home_month_stats`), cached on the phone | Must match for every member and outlive retention |
| Older History and Invoices | Server, cursor pages, viewed pages cached | Grows forever |
| History search | Server | Needs every purchase |
| CSV export | Server | Needs every purchase |

Server tables (unchanged from the first proposal):

1. **`home_products`**: one row per home and item name, with the last price, last unit, last bought date and times bought. Updated when an item is marked bought. Synced in full to the phone.
2. **Trips as real rows**: every trip gets a row when its first item is bought, with its total and item count kept up to date. Replaces the 90-minute guess made on the phone.
3. **`home_month_stats`**: one row per home, month and category with spend and item count. Updated when an item is bought, un-bought or re-priced.

Needed for the phone to sync only changes (detail in workstream 5):

- `updated_at` on every synced table, and a record of deletions.

### D2a: phone storage (decided 2026-11-23)

Fact: the app already uses SQLite. `expo-sqlite/localStorage` (`frontend/features/auth/utils/session-storage.ts`) keeps a SQLite file with one table, `storage (key, value)`. The whole cache is one row of it: key `omt.query.v1`, value one long JSON text. So the choice is not "SQLite or not" but "one big value, or real tables with one row per item".

After D2 the phone holds a bounded set: needed items, two months of purchases and the product names. Estimate for a heavy home: about 500 rows, about 200 kB of JSON. That size depends on one home, not on how many users the app has.

| | One big value (today) | Real tables |
| --- | --- | --- |
| Save after a change | Rewrites all of it | Writes one row |
| App start | Parses all of it | Reads only the rows the first screen needs |
| Memory | Everything loaded | Only what is on screen |
| Search and sort | In JavaScript | In native code, with indexes |
| A crash while saving | Safe: SQLite completes a write or leaves the old value | Safe, same reason |
| Changing the shape of the data in an update | Throw the cache away and download again | Needs a migration step on the phone |
| Work needed | None | Rewrite of the offline layer (cache, outbox, restore) and its tests |

Decision: move to real tables, as the last app-side step. The sync protocol (workstream 5) comes first, because tables can only be filled once that sync exists. Until then the cache stays as it is, bounded by D2.

### D3 (decided 2026-11-23): indexes

Measured on the performance lab (`docs/perf-lab/`): Postgres 16, 30,000 homes, 5.1 million items, 6,000 active homes with 720 purchases each. "Pages" is the number of 8 kB pages Postgres read to answer; it is the number that matters on a small server, where most pages are on disk and not in memory.

New index:

```sql
create index items_home_bought_idx
  on items (home_id, bought_at desc, id desc)
  where status = 'bought';
```

| Query | Pages before | Pages after | Time before | Time after |
| --- | --- | --- | --- | --- |
| Today's full list (750 rows) | 781 | not used any more | 7.1 ms | |
| List read, needed items only (D1) | 39 | 39 | 0.2 ms | 0.2 ms |
| History page 1 | 727 | 34 | 1.35 ms | 0.18 ms |
| History page 21, by OFFSET | 727 | 727 | 1.29 ms | 1.85 ms |
| History page 21, by cursor | 727 | 35 | 1.15 ms | 0.15 ms |
| This month's total by category | 724 | 49 | 1.22 ms | 0.20 ms |
| Last two months of purchases (the phone's window) | 721 | 106 | 1.26 ms | 0.31 ms |
| Search "tom" in one home | 724 | 530 | 1.76 ms | 1.50 ms |

Findings:

- The existing `items_home_status_idx` already finds a home's rows. Without the new index every History query reads all of the home's purchases (about 720 pages) and sorts them. With it, a page of 30 reads about 34 pages.
- OFFSET gets no benefit from the index; the cursor does. This confirms D1.
- Search inside one home needs no search index. Retention bounds a home's history, so scanning it is cheap. `pg_trgm` is not needed.
- A month's total costs 49 pages when summed live. So `home_month_stats` does not need to be kept up to date on every purchase (see "D2 revision" below).

Cost of indexes (5.1 million rows; the table itself is 916 MB):

| Index | Size | Serves |
| --- | --- | --- |
| `items_list_created_idx (list_id, created_at)` | 318 MB | One count for the Ask-home feature (`countAddedSince`) |
| `items_home_bought_idx` (new) | 270 MB | History, month totals, the phone's window, retention per home |
| `items_pkey` | 199 MB | Finding an item by id |
| `items_home_status_idx` | 48 MB | The list read |
| `items_receipt_idx` | 31 MB | Items of one trip |

Together the indexes are almost as large as the table, and every one is updated on each write. Open point: `items_list_created_idx` is the largest index and serves one small feature; look for a smaller replacement.

Still to design, once their workstreams define the queries: the index for change-only sync (`home_id, updated_at`, workstream 5) and for the retention job (workstream 4).

### D2b (decided 2026-11-23): when `home_month_stats` is written

First proposal: update the month's row on every purchase, un-purchase and price change. Measured alternative: sum the month live from `items` using the new index (49 pages, 0.2 ms), and write the `home_month_stats` rows once, by the retention job, just before it deletes that month.

| | Updated on every write | Written at clean-up |
| --- | --- | --- |
| Code on the write path | Every place that changes a purchase must adjust the totals | None |
| Risk of a wrong total | A missed case leaves the total wrong until repaired | None for live months: the total is always the real sum |
| Read cost | 1 row | About 49 pages for a live month, 1 row for a cleaned month |

Decision: written at clean-up.

### The three costs of an index

1. **Slower writes.** Every insert, and every update that touches an indexed column, also updates each index. This is the main cost.
2. **Disk.** In the lab the indexes on `items` add 866 MB to a 916 MB table.
3. **Memory.** An index is only fast while the part in use fits in RAM. Unused indexes push useful data out.

Rule for this project: an index exists only if a named, frequent query needs it, and the migration that creates it says which query.

### Lessons from the reference project (`Work/tries/Chat/Chat`, studied 2026-11-23)

A production messenger: NestJS, MongoDB, Redis, BullMQ, socket.io, S3-compatible storage; Expo app with Realm and Redux. Much of it exists for end-to-end encryption and calls and does not apply here. What applies:

| Area | What they do | What we take |
| --- | --- | --- |
| Paging | Cursor on `(creationDate, _id)`, because rows share timestamps. Page size validated and capped at 200. | Same shape as D1/D3: cursor on `(bought_at, id)`. Add a server-side cap on page size. |
| Indexes | Each index has a comment naming its query. Unique and partial indexes used as guards against duplicates. Indexes are created by a deploy script, not at boot, after a boot-time build failed a deploy. | The index rule above. Build large indexes with `create index concurrently`, outside server start (workstream 10). |
| Deletions | Tombstones: a deleted row stays as `isDeleted` so offline phones learn about it. | Needed for change-only sync (workstream 5). |
| Sync | Each chat has a counter stamped on every change; phones ask for what is newer. | A per-home change counter is a candidate design for workstream 5. |
| Outbox | The phone creates ids; a resend reuses the id, so the server can ignore duplicates. | Already done here (`input.id` in `items.service.ts`). Keep it. |
| Writes | A state change and its side effects commit in one transaction; notifications go out after commit. This fixed lost deliveries. | Apply to "mark bought" plus `home_products` update. |
| Scheduled jobs | Every cron takes a lock first, because a timer fires in every server instance. | Needed when a second instance runs (workstream 6). Postgres advisory locks do this without Redis. |
| Media | A small `Storage` interface with a local-disk driver and an S3 driver. The database holds ids and metadata only, never URLs; object keys are built from ids. The phone makes the thumbnail. A daily job removes abandoned uploads. | The `Storage` interface, ids-only rows, keys built from ids, a thumbnail, an orphan sweep (D4). |
| Media, not to copy | Files are streamed through the API with no cache headers, and full images are not compressed. | We keep cache headers and resizing, and send downloads straight from storage. |
| App layering | Repositories are the only code that touches the local database; screens never do. | Use for the SQLite move (D2a). |
| Lists | Virtualized lists (FlashList, Legend List) with `keyExtractor`, `getItemType`, and no gesture detector inside a recycled row. Measured: 63% fewer dropped frames after tuning. | Workstream 8. |
| Phone schema | A numbered schema version; changes are additive; slow backfills run after start-up. | Use for the SQLite move (D2a). |
| Start-up | First screen is drawn from local data; heavy screens preload when idle. | Workstream 8. Their start-up waits on a network call; ours must not. |

Not copied, because it is too much for this app's needs: Redis and BullMQ, the per-device delivery queue, self-hosted object storage, client-side file encryption, Realm (deprecated upstream).

### D4 (decided 2026-11-23): photos

Today: bytes in Postgres (`item_images.data`), one size (1280 px JPEG, made by `sharp`), served by the API at `GET /item-images/:imageId` with no sign-in. The image id is a random UUID that only the home's members see.

Proposed:

1. **Where:** an S3-compatible object store. Candidate: Cloudflare R2 (no charge for downloads; check current prices at https://developers.cloudflare.com/r2/pricing/).
2. **Upload:** stays through the API. The API validates and resizes with `sharp` as today, then writes the results to storage. Uploads are rare (2% of purchases), so the API can afford them, and the server keeps control of size and format.
3. **Sizes:** two files per photo: `full` (1280 px, as today) and `thumb` (about 256 px) for list rows.
4. **Download:** straight from storage. `GET /item-images/:imageId` stays, but answers with a redirect to the file's storage address, so installed app versions keep working. New app versions receive the storage address with the item and skip the API.
5. **Database:** `item_images` keeps metadata only (id, item, home, mime type, width, height, byte size, created date). The `data` column is dropped after the copy.
6. **Keys:** `homes/<homeId>/<imageId>/full.jpg` and `.../thumb.jpg`. Built from ids, never stored. Everything of one home sits under one prefix, which makes deleting a home or counting its usage one operation.
7. **Code:** a `Storage` interface (`put`, `get`, `delete`, `deletePrefix`) with a local-disk driver for development and tests and an S3 driver for production.
8. **Deletion:** the stored files are deleted when the photo is replaced or removed, the item is deleted, the home is deleted, or retention removes the purchase. A daily job removes files that no row points to.
9. **Migration:** a one-off script copies existing photos (8 today, 785 kB) to storage, verifies them, and only then is `data` dropped.

Decided 2026-11-23:

- Provider: Cloudflare R2, on its free tier.
- Blurred placeholder: yes. A `thumbhash` (about 30 bytes) is computed at upload and stored in `item_images`; `expo-image` shows it while the file loads.

R2 prices, read from https://developers.cloudflare.com/r2/pricing/ on 2026-11-23:

| | Free every month | Beyond that |
| --- | --- | --- |
| Storage | 10 GB | $0.015 per GB per month |
| Writes and listings (Class A) | 1 million | $4.50 per million |
| Reads (Class B) | 10 million | $0.36 per million |
| Downloads (egress) | Free | Free |
| Deletes | Free | Free |

What the free tier covers (estimates, at about 108 kB per photo for both sizes):

- 10 GB holds about 92,000 photos.
- At 2% of purchases having a photo, that is one year of photos for about 45,000 registered users.
- At 1 million registered users, about 220 GB per year, so about $3 per month for each year of photos kept.

Download privacy (decided): a public address containing the random image id. This is the protection the current endpoint already relies on. A replaced or removed photo gets a new id and its files are deleted.

Left for workstream 7: photo limits per plan.

New backend packages needed, to approve at build time: `@aws-sdk/client-s3`, `thumbhash`.

### D5 (decided 2026-11-23): retention and plans

Facts from the code: a user can belong to several homes (`ManyHomes` migration). Limits already exist as fixed constants (`SET_LIMIT`, `PIN_LIMIT`, `SET_ITEM_LIMIT`).

1. **Limits are data, not code.** One table in the code maps each plan to its limits (history months, photos per home, sets, pins, and any feature switch). The server sends the home's limits with the home, so the app can show locks, and the server enforces every limit itself.
2. **The plan belongs to the home.** Any member can pay; the purchase is tied to that member's store account and recorded against one home. Everyone in the home gets the plan.
3. **History length is a view first, a deletion later.** Every history read is cut at the plan's window (`bought_at >= start of window`), served by `items_home_bought_idx`. The limit applies the moment a plan changes, in either direction. A separate job deletes what has been outside the window for longer than a grace period.
4. **The clean-up job** runs daily, works home by home in small batches, and for each expired calendar month: writes `home_month_stats`, deletes the purchases, their photos and any trip left empty. `home_products` is never cleaned, so suggestions and last prices survive.
5. **A lifetime plan** gets the same limits as the yearly plan. It is a payment option, not a higher tier.

Timing (proposed 2026-11-23): the app is not in the stores yet and has active users.

| Build now (no store needed) | Build with the store release |
| --- | --- |
| The plan-to-limits table and the server checks | The paywall screen and store prices |
| A plan recorded per home, with an end date | The purchase and restore flow (a native billing SDK, so a new app build) |
| Limits sent to the app; a generic "locked" state in the UI | The link from the billing service to the server that sets a home's plan |
| The history window on reads, the grace period, the clean-up job, `home_month_stats` | Final free and paid limits, and what existing homes are given |
| Setting a home's plan by hand, for testing | |

Until billing exists every home is on one generous plan, so no current user loses anything. The server only needs to be told "home X is on plan Y until date Z"; by hand now, by the billing service later.

Grace period (30 days): how long history that a plan change has hidden is kept before it is deleted for good. It only applies when a home moves to a shorter window (a subscription ends, a payment fails). Rule for the job: delete purchases older than the plan's window only when the plan was last changed more than the grace period ago. History that simply ages out of an unchanged plan is deleted at the next run.

To decide with the store release: the final limits and which features are paid.

### D6 (decided 2026-11-23): sync

Where the app asks the server today:

| Where | How often | What it downloads |
| --- | --- | --- |
| Trip screen, shopping alone | every 5 s | the full item list, history included |
| Trip screen, shopping together | every 3 s | the full item list, plus the lock |
| Items screen, lock state | every 3 s | the lock |
| Ask-home answers | every 15 s | the asks |
| App returns to the foreground | at most once a minute | home, lists, items |

Two separate questions: **what** the server sends, and **when** the phone asks.

**What: a change counter per home.**

- `homes.version` is a whole number that starts at 0.
- Every change to anything in a home (item, list, trip, product, pin, set, category, setting) runs in one transaction that adds 1 to `homes.version` and writes the new number on the changed row (`version` column).
- Updating the home row locks it for the length of the transaction, so two changes in one home can never get the same number or commit out of order. This is why a counter is used and not a timestamp: with timestamps a slow transaction can save a row "in the past" and a phone that already synced never sees it.
- A deleted row is kept as a marker (`deleted_at` set, new `version`), so phones learn about the deletion. Markers older than 60 days are removed by the daily job.
- `GET /homes/:homeId/changes?since=<version>` returns the rows with a higher version, grouped by type, and the home's current version. When `since` equals the current version it answers "nothing changed" after reading one row.
- A phone whose `since` is older than the oldest kept marker is told to start again from a fresh copy.
- First sync and fresh copy: needed items, purchases of the two-month window (paged), products, lists, trips of the window, then the current version.
- Purchases outside the phone's window are left out of the answer.

Measured on the lab (one active home, 750 rows):

| Request | Pages read |
| --- | --- |
| Today: full list | about 700 |
| Has anything changed? | 3 |
| 3 rows changed | 9 |
| 50 rows changed (back from offline) | 57 |

New index: `items (home_id, version)`. Its size at real scale is still to be measured; the lab copy has versions on 200 homes only. With it, `items_home_status_idx` can shrink to a partial index on needed items.

**When: keep polling for now, move to a pushed signal later.**

| | Polling the changes endpoint | Server-sent events (SSE) | WebSocket |
| --- | --- | --- | --- |
| How | The phone asks every few seconds | The phone keeps one connection open; the server sends "home is at version N" | A two-way open connection |
| Delay | Up to the polling interval | Under a second | Under a second |
| Server cost when idle | One 3-page request per poll | One open connection per active phone | One open connection per active phone |
| More than one server instance | Works as is | Needs a signal between instances (Postgres `LISTEN/NOTIFY` can do it) | Needs a signal between instances and sticky routing |
| Works on a server that sleeps | Yes | No | No |
| Work | Small | Medium | Large |

Proposed: step 1, polling against the changes endpoint, on the screens that poll today. Step 2, SSE as the trigger, when the server is on a paid plan and the measured polling load justifies it (limit set in workstream 6). The "what" part is the same in both steps, so step 2 changes only the trigger.

Unchanged: the phone's outbox of pending changes and its client-made ids.

### D7 (decided 2026-11-23): server and hosting

Measured 2026-11-23 from Amman, `GET /api/health` (a request that does no work):

| | Time to first byte |
| --- | --- |
| Server asleep (first call) | 22.5 s |
| Server awake (5 calls) | 0.24 to 0.63 s, typically 0.26 s |
| Connection to the nearest edge (Amman) | 0.01 s |

So about 0.25 s of every request is the trip to Oregon and back, and the first request after a sleep waits about 22 s. The free web plan sleeps after 15 minutes without traffic (Render docs). The existing wake-up cron runs every 15 minutes (`.github/workflows/pins-tick.yml`) and GitHub runs schedules late, so the server sleeps between runs.

Facts from Render's docs (read 2026-11-23): a service's or database's region cannot be changed, a new one must be created; regions are Oregon, Ohio, Virginia, Frankfurt, Singapore; free web services support custom domains and get 750 hours per month; paid Postgres plans include PgBouncer connection pooling at no extra cost; this database plan allows 100 connections.

State the server keeps in its own memory (breaks or misbehaves with two instances):

| State | Where | Fix |
| --- | --- | --- |
| The pins timer, running in every instance | `pins.scheduler.ts` | Take a Postgres advisory lock before each run, so one instance does the work |
| "Released on read" timestamps | `items.service.ts:76` | Removed: after D6 a read no longer triggers writes |
| Rate-limit counters | `app.module.ts` (in-memory throttler) | Accept per-instance limits until a second instance exists; then shared storage |
| Notifications waiting to be grouped | `notifications.service.ts:97` | Keep them in a table, so they survive a restart and group across instances |

Proposed, at no extra monthly cost:

1. A custom domain for the API (for example `api.<domain>`), so the server can move without the installed apps changing address. Cost: the domain itself.
2. Move the API and the database to Frankfurt, the nearest Render region to the Middle East. Same plans, same price. Data to copy: 10 MB.
3. Make the server stateless (the table above).
4. Close the database to the public internet, after confirming the API uses the internal address.
5. Make the health check query the database.
6. Until the API is on a paid plan: run the wake-up cron every 10 minutes. It reduces sleeping; it cannot guarantee it.

When to start paying (limits to confirm in workstream 9, once metrics exist):

| Trigger | Step |
| --- | --- |
| The store release | API to the first paid plan, so it never sleeps |
| Database CPU above 70% for sustained periods, or disk above 70% | Next database plan |
| API CPU above 60% sustained, or 95% of requests slower than 300 ms | A second API instance, and turn on connection pooling |
| Polling above a set number of requests per second on a paid API | Server-sent events (D6 step 2) |

Keeping the server awake (decided): a request to `/api/health` every 5 minutes, so one late or missed run still lands inside the 15-minute limit. The free plan sleeps only after 15 minutes without traffic, so a reliable pinger keeps it awake in practice. It is not a guarantee: Render can still restart a free instance, and the workspace gets 750 free hours a month (an always-on service uses up to 744; this workspace has one service). Only a paid plan guarantees no sleep. GitHub's scheduler runs late, so a dedicated free uptime monitor is the better pinger; it also reports downtime (workstream 9).

Custom domain (deferred): free alternatives exist, for example a Cloudflare Worker address in front of the API (free up to 100,000 requests a day). Not adopted: it adds a moving part and a request cap, and the move below works without it.

#### Runbook: move to Frankfurt without losing data (deferred 2026-11-23)

Deferred by the owner; kept for when the move is wanted. Until then about 0.25 s of each request is the distance to Oregon. Nothing here has been run. Each step that changes production is confirmed with the owner first.

What must survive: every table (accounts, sessions, homes, items, photos, push tokens). Users stay signed in because sessions are rows in the database and the new API gets the same `JWT_ACCESS_SECRET`.

1. Create the new database in Frankfurt, same plan. Cost: two databases are billed while both exist, so keep the overlap to days.
2. Create the new API service in Frankfurt, free plan, with the same environment variables as the old one, pointing at the new database. Do not send traffic to it yet.
3. Rehearse: copy the data once (`pg_dump` from the old database, `pg_restore` into the new), start the new API against it, check sign-in, lists, history and photos with a test account. Then empty the new database again.
4. Switch, at a quiet hour:
   1. Stop the old API from accepting writes (Render maintenance mode).
   2. Copy the data again. At 10 MB this takes under a minute.
   3. Compare row counts per table between the two databases.
   4. Point the **old** API's `DATABASE_URL` at the new Frankfurt database (its external address) and take it out of maintenance. From here both addresses serve the same data, so phones on the old address lose nothing; they are only slower.
5. Publish an app update (OTA) with the new API address. Per the project's release rule, `EXPO_PUBLIC_API_URL` is passed inline.
6. Watch the old API's request log. When requests stop (or after an agreed number of weeks), delete the old API and the old database.
7. Then close the new database to the public internet (step 4 needs it open while the old API still connects from Oregon). While the move is deferred, the current database can be closed as soon as the API is confirmed to use its internal address.
8. Point the pinger at the new address only, so the old service sleeps and does not use free hours.

Rollback before step 6: point the old API back at the old database and publish the old address again. Data written after the switch would have to be copied back, so the rollback window is kept short.

Measure after: repeat the Amman timing from this section and record it.

### D8 (decided 2026-11-23): app performance

No measurement of the running app has been taken yet. Everything below comes from reading the code, so the first step is to measure.

What the code shows:

| Finding | Where | Effect |
| --- | --- | --- |
| One context holds all items and every action | `PurchasesContext`, `frontend/features/items/hooks/use-purchases.tsx:161` | Any change to any item re-renders every screen that uses it, including the Items screen (2,113 lines) and the trip screen (2,162 lines) |
| A poll replaces the whole list every 3 to 5 seconds | `trip-screen.tsx:1155` | Those re-renders repeat on every poll |
| No list is virtualized | `components/ui/Screen.tsx:432` (`ScrollView` and `.map()`) | Every row is drawn, on screen or not |
| The launch intro covers the app until auth, home and items are loaded, for at most 2.6 s | `app/_layout.tsx:151`, `components/ui/LaunchIntro.tsx:31` | To measure: whether "loaded" waits for the network or is satisfied by the saved copy |
| Four font files are loaded at run time before anything is drawn | `app/_layout.tsx:187` | A short blank period at start |
| Photos use `expo-image` at one size | `features/items/components/item-photo.tsx` | Fixed by D4 (thumbnail, placeholder) |
| React Compiler is on | `app.json:109` | Component-level memoising is automatic; it does not stop context-wide re-renders |

Targets, on the slowest phone among current users, release build:

| Measure | Target | How it is measured |
| --- | --- | --- |
| Cold start to a usable Items screen, with saved data, no network | under 2 s | `adb shell am start -W`, plus a mark logged when the first list is drawn |
| Tick an item: tap to visible change | under 100 ms | React Native DevTools performance panel |
| Scrolling History with 500 rows | no visible stutter; under 5% dropped frames | The same panel |
| Re-renders while idle on the trip screen | none | React DevTools profiler |

Order of work:

1. **Measure** the four numbers above on today's app. This is the baseline.
2. **No change, no re-render.** Comes with D6: when the changes request says "nothing changed", no state is touched.
3. **History as a virtualized list** that loads the next page on scroll. Built-in `FlatList` first; `FlashList` (a new package, to approve) only if the measurement still fails the target. The Purchases/Invoices swipe stays.
4. **Split the item data from the actions**, and let each screen subscribe only to the part it shows, so ticking one item does not re-render everything.
5. **Start-up:** show the first screen from the saved copy without waiting for the network; embed the fonts at build time (`expo-font` config plugin) so they are not loaded at run time.
6. **Photos** as decided in D4.
7. **SQLite tables** on the phone (D2a), last.

Not planned: splitting the 2,000-line screen files. Size alone is not a speed problem; they are split only if a measurement points at them.

iOS: the project has never been built for iOS (no `ios/` folder, no bundle identifier in `app.json`). Known Android-only parts: the home-screen widgets (`features/widgets`), the forced update that opens an APK link (`components/ui/ForceUpdate.tsx`), the hardware back button on the trip screen, and blur fallbacks in `BlurBackdrop.tsx`. iOS cannot be run from this Linux machine; a first iOS build and its gap list are scheduled with the store release.

### D9 (decided 2026-11-23): monitoring and load testing

Today nothing is measured: the free plan keeps no request metrics, and the "start paying" triggers in D7 cannot be checked.

Monitoring, all at no cost:

| What | How | New package |
| --- | --- | --- |
| Is the server up | A free uptime monitor requesting `/api/health` every 5 minutes. It is also the keep-awake pinger from D7. | None (an outside account) |
| How long each request takes | One log line per request: method, route, status, milliseconds. A script reads the log and prints the slowest routes. | None |
| Slow database queries | TypeORM's `maxQueryExecutionTime`: any query over 200 ms is logged with its SQL. | None |
| Which queries cost the most overall | The `pg_stat_statements` extension in Postgres. | None |
| Database size, processor, connections | Render's dashboard, checked monthly against the D7 triggers. | None |
| App start time, saved-copy size and save time | Timing marks in the app, written to its existing error log. | None |

Error and performance services with free tiers (Sentry, PostHog) are left for the store release; each needs a new package.

Load testing, never against production:

- **Database level:** the performance lab (`docs/perf-lab/`). Every new query gets a lab file showing its plan and pages read, kept in the repository.
- **API level:** the local Docker API pointed at the lab database, driven by the Postman CLI's performance runner (already installed on this machine). Three scenarios:
  1. 200 phones asking "what changed" every 3 seconds, with a change made every few seconds.
  2. 50 phones paging through History.
  3. 50 phones marking items bought.
- **Pass mark:** no errors, and 95% of requests under 200 ms on this machine. The numbers are recorded in the spec so later runs can be compared.

### D10 (decided 2026-11-23): rollout order

Rule: **add the new beside the old, move the app over, then remove the old.** The server never removes something an installed app version still uses; old versions are retired with the existing minimum-version check (`APP_MIN_VERSION`). The backend always deploys before the app.

| Phase | What ships | Visible to users | Needs |
| --- | --- | --- | --- |
| 0. Measure and guard | Uptime monitor and 5-minute pinger, request and slow-query logs, health check that queries the database, baseline app measurements, close the database to the internet | Faster first open (server awake) | Backend deploy |
| 1. Database foundations | Migrations, all additive: `homes.version`, row `version` and `deleted_at`, the history and version indexes, trips as rows (existing purchases grouped once), `home_products` (filled once from history), plan columns on the home. Pins lock. | Nothing | Backend deploy |
| 2. New endpoints | Changes, History pages, month totals, products. Old endpoints stay. Load test. | Nothing | Backend deploy |
| 3. App moves over | Sync by changes, two-month window, History paged and virtualized with the new design, suggestions from products, no redraw when nothing changed | Faster app, new History | App update (no new native code, so over the air) |
| 4. Photos | R2 storage, thumbnails, placeholders, copy of existing photos | Faster photos | Backend deploy, then app update |
| 5. Retention and plans | The plan table, limits sent to the app, the clean-up job, `home_month_stats`. Every home on the 12-month plan. | Nothing yet | Backend deploy, then app update |
| 6. App internals | Split the shared store, start-up work, then SQLite tables | Faster app | App update; SQLite tables may need a new build |
| 7. Clean up | Raise the minimum version, remove old endpoints, drop `item_images.data`, shrink `items_home_status_idx` | Nothing | Backend deploy |

Deferred, each with its own trigger: the Frankfurt move, a custom domain, billing and the paywall, server-sent events, a second server, the first iOS build.

## Step 12 results (2026-11-23): the lab and the load test

Everything here was measured on the performance lab (`docs/perf-lab/`), rebuilt through the real migrations: Postgres 16 in Docker, 30,000 homes, 5.1 million items (4.9 million purchases), parallel query off. Never on production. The lesson files that print every plan are `docs/perf-lab/s12-*.sql`; the load test is `docs/perf-lab/load-test.mjs`.

### How to read the numbers

- **Pages** is how many 8 kB blocks Postgres touched to answer (the `Buffers:` line of a plan). On production's small database most pages are not in memory and each one is a trip to the disk, so pages are the cost that matters, more than the milliseconds measured on this fast machine.
- **A good query touches a few pages per row it returns.** About 3 pages to find one row by its key (two index levels and the row) is the floor. When a query touches hundreds of pages and returns three rows, it is reading rows only to throw them away. That is the sign of a missing or wrong index.
- **Time** is the time inside Postgres (`Execution Time`), with the data already in memory.

### What the lab cannot show exactly (read the tables with this in mind)

1. **A home's purchases sit together on disk in the lab.** Migration 027 rewrote every item, and the rewrite put each home's rows next to each other (the busy home's 720 purchases are on 78 pages). In a real, mixed table they could be on up to 720 pages. Queries that fetch many items of one home (full copy, product refresh, months list) cost more in real life than here; index-led queries for a page of 30 barely change.
2. **The lab has about one trip per purchase** (4.3 million trips for 4.9 million purchases), because the seed scatters purchase times at random. Real people buy 5 to 10 things per trip. Every number that reads trips is therefore a worst case, about five times too high.
3. **Postgres here has 128 MB of memory for data** (`shared_buffers`, Docker's default). Production has less and runs on 0.1 CPU, so production times will be slower; the page counts are what carry over.

### The migrations at 5 million rows

| Migration | Lab (4.9 M purchases) | Production (399 items, rehearsed in step 4) |
| --- | --- | --- |
| 027 `TripsAsRows` | **20 min 51 s** (made 4.3 M trips; the slow part is the one `update` that gives every purchase its trip) | 0.19 s for 025 to 029 together |
| 028 `HomeProducts` | **about 3 min 50 s** (028 to 031 together; 1.5 M products) | (included above) |
| 032 `TripLastBoughtIndex` (new, see below) | 4 s (4.3 M trips; the index is 167 MB) | instant |

These migrations run **once**, on today's production data, where they take well under a second. 21 minutes at 5 million rows is a note for the future (for example, if the grouping ever had to be run again on a large database, it should be done in batches), not a blocker for this release.

### Pages and time per query

Busy home = lab home 2 (720 purchases a year, 30 needed items). 3-year home = lab home 1 (2,160 purchases over three years). "Since N" means about 20 items, 5 products, 3 trips and 5 deletions changed: a phone that was away for a few minutes. Numbers are with migration 032 in place; "before" is shown where it changed.

**Changes endpoint** (`s12-changes.sql`)

| Query | Rows | Pages | Time | Verdict |
| --- | --- | --- | --- | --- |
| Every request: the user (token check) | 1 | 3 | 0.04 ms | floor |
| Every request: membership | 1 | 3 | 0.03 ms | floor |
| Every request: remove expired shop locks | 0 | 38 | 0.05 ms | fine (tiny table) |
| **"Nothing changed"**: the home row | 1 | **3** | 0.03 ms | floor; matches the spec's 3 pages |
| Items changed since N, busy / 3-year | 20 | 8 / 4 | 0.09 / 0.05 ms | good |
| Items of the 3 trips that changed | 3 | 13 | 0.08 ms | good |
| Products changed since N | 5 | 5 | 0.05 ms | good |
| Trips in the window changed since N, busy home | 3 | **655 before, 105 after** | 0.80 → 0.18 ms | was a missing index, fixed |
| Same, 3-year home | 3 | **1,881 before, 98 after** | 3.4 → 0.52 ms | was a missing index, fixed |
| Deletion markers since N | 5 | 4 | 0.05 ms | good |
| Full copy: items (needed + 2-month window) | 140 | 100 | 0.55 ms | good |
| Full copy: trips of the window | 104 | 655 → 105 | 0.94 → 0.20 ms | fixed with the same index |
| Full copy: products | 176 | 8 | 0.14 ms | good |

**History** (`s12-history.sql`, busy home, last month)

| Query | Rows | Pages | Time | Verdict |
| --- | --- | --- | --- | --- |
| Purchases, page 1 | 31 | 179 | 0.5–0.7 ms | fine, see note A |
| Purchases, page 2 by cursor | 31 | 159 | 0.44 ms | fine (page 20 costs what page 2 costs) |
| Purchases, one category | 8 | 116 | 0.21 ms | fine |
| Search "tom", every kept month | 31 | 97 | 0.73 ms | good |
| Search with no match (worst case), busy / 3-year | 0 | 91 / 95 | 0.69 / 0.82 ms | good: the plan cutoff keeps it to 12 months |
| Trips page with counts and preview | 21 | 264 | 0.82 ms | fine |
| Month totals (rows by trip and category) | 67 | 314 | 0.92 ms | fine |
| Months list, busy home | 649 | 3,321 | 5.9 ms | **watch**, see note B |
| Months list, 3-year home | 1,898 | 9,730 | 19.3 ms | **watch**, see note B |

**Writes on a purchase** (`s12-writes.sql`)

| Query | Rows | Pages | Time | Verdict |
| --- | --- | --- | --- | --- |
| Find the open trip of the list (every purchase), busy home | 0–1 | **658 before, 3 after** | 1.4 → 0.04 ms | was a missing index, fixed |
| Same, 3-year home | 0–1 | **1,881 before, 3 after** | 4.1 → 0.05 ms | was a missing index, fixed |
| Set the trip's times from its items | 1 | 106 | 0.84 ms | fine (most of it is the trigger and index upkeep) |
| Product upsert | 1 | 36 | 0.33 ms | good, see note C |
| Product refresh after undo or price change | 1 | 201 | 3.7 ms | **watch**, see note D |

**Clean-up job** (`s12-cleanup.sql`)

| Query | Rows | Pages | Time | Verdict |
| --- | --- | --- | --- | --- |
| Probe a home with nothing to clean (almost every home, every day) | 0 | 13 | 0.42 ms | good: 30,000 homes cost about 13 seconds of reading a day |
| Probe the 3-year home (24 old months) | 24 | 628 | 2.9 ms | fine: it reads the old trips it is about to delete |
| One delete batch's select (one old month) | 40 | 172 | 0.52 ms | fine |

### Finding: the trip lookups read every trip the home ever had (fixed, migration 032)

Two frequent queries ask about a trip's **last** purchase time: "is there a trip of this list whose last purchase was in the last 90 minutes?" (every purchase) and "which trips of the window changed?" (every changes answer with rows). The only index on a home's trips, `trip_receipts_home_started_idx`, is sorted by **start** time. So Postgres fetched every trip of the home and threw nearly all of them away: the plan says `Rows Removed by Filter: 649` for a query that returns nothing. The cost grows with the home's history: 658 pages for the busy home, 1,881 for the 3-year home, on **every purchase**.

Fix: one more index, sorted by last purchase time.

```sql
create index trip_receipts_home_last_idx on trip_receipts (home_id, last_bought_at desc);
```

| | Before | After |
| --- | --- | --- |
| Open trip on purchase, busy home | 658 pages, 1.4 ms | 3 pages, 0.04 ms |
| Open trip on purchase, 3-year home | 1,881 pages, 4.1 ms | 3 pages, 0.05 ms |
| Changed trips of the window, busy home | 655 pages | 105 pages |
| Changed trips of the window, 3-year home | 1,881 pages | 98 pages |

It went into a **new migration, 032 `TripLastBoughtIndex`**, and not into 027: the development and rehearsal databases have already run 027 and would silently miss an index added there. A test (`backend/src/database/trip-indexes.db-spec.ts`) checks that both queries are answered from the new index; it fails without migration 032. Its cost: one more index to update when a trip changes (a trip changes once per purchase), and 167 MB in the lab (about a third of the trips table). The lesson `s12-trip-index.sql` shows the plans without and with it.

The changed-trips query still reads the window's trips (105 pages) to return 3. An index on `(home_id, version)`, like the one items and products have, would bring that to about 3 pages; it is not worth a second index while the window holds a few dozen real trips (note 2 above).

### Notes

- **A. A History page reads 179 pages, not the spec's 34.** The spec measured the page before decision 11 (a purchase belongs to the month its trip started). The page now checks each row's trip: 39 pages for the items (the spec's number) plus 4 per row for the trip. In the lab every purchase has its own trip; with real trips of 5 to 10 items the trip pages repeat and it drops to about 60. 0.5 ms; no index can remove this.
- **B. The months list reads the home's whole history each time History opens**: every trip and every purchase, to total each month (3,321 pages for the busy home, 9,730 for the 3-year home). It is not a missing index: it really needs every row. A rewrite that groups the purchases first was tried and saved little (2,679 pages). It is bounded by the clean-up job (12 months kept), and real homes have about five times fewer trips. Watch it in the request log; if it shows up, keep a month row per home up to date or let the phone keep the list.
- **C. The first write on a new database connection is slow** (566 pages, 7 ms for the product upsert, against 36 pages and 0.3 ms after). The first time a connection fires a trigger, Postgres compiles the trigger function and plans its queries. The API keeps its connections open, so only the warm number matters; the lesson file warms up first.
- **D. Undo and price changes re-read the home's purchases of that name** to find the newest one. There is no index on the normalised name, so it reads every kept purchase of the home (about 750 rows, 201 pages here, more in a mixed table) and applies the name-key function to each. 3.7 ms, only on undo and price change, and bounded by the 12 months kept. Not worth an index now.

### Load test: the local API on the lab database

Setup: the API built from this branch (`node dist/main.js`, one Node process, database pool of 10) on port 3997, pointed at `omt_perf`. Each virtual phone is a different lab user with a real signed access token (the API allows 120 requests a minute per user). The Postman CLI's performance runner needs a Postman account login, which this machine does not have, so the load comes from a small Node script (`load-test.mjs`, no packages). The Postman CLI does run the smoke collection (`load-smoke.postman_collection.json`) without a login: 6 requests, 19 assertions, all passed.

Pass mark (spec section 8): no errors, and 95% of requests under 200 ms.

| Scenario | Requests | p50 | p95 | max | Errors | Under 200 ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| (a) 200 phones asking "what changed" every 3 s, 60 s | 4,000 | 7.4 ms | 10.5 ms | 38 ms | 0 | 100% | pass |
| … the purchase made every 2 s meanwhile | 30 | 39 ms | 72 ms | 75 ms | 0 | 100% | |
| (b) 50 phones paging History by cursor, 60 s | 2,947 | 18 ms | 34 ms | 104 ms | 0 | 100% | pass |
| (c) 50 phones marking bought, about 1 a second each, 60 s | 2,934 | 22 ms | 32 ms | 73 ms | 0 | 100% | pass |
| (c) again, 180 s | 8,753 | 24 ms | 33 ms | 764 ms | 0 | 99.3% | pass |
| All three at once, 120 s (164 requests a second) | 19,656 | 9–31 ms | 31 / 62 / 97 ms | 313 ms | 0 | 98.9–100% | pass |

In the combined run the three p95 values are changes / History / mark bought.

**Two runs of scenario (c) did not pass** (p95 879 ms and 842 ms, no errors). Both times all requests slowed down for 20 to 30 seconds and then went back to about 30 ms (p95 per 10 seconds: `48 40 1236 1107 185 34 31 34 31 26`). The 180-second run caught a short one while recording the machine: at that moment the whole 20-core machine was 94–97% busy, with 31–47 processes waiting for a processor, against 74% idle on average. The emulator VMs' share of the processor doubled at the same moment (7% to 16%), and 15 GB of swap was in use. The test's own load is steady and cannot fill 20 cores, so the stalls come from other work on this shared machine, not from the API or the database: no query was slow (the API logs every query over 200 ms, and logged none). Writes feel a stall most, because each purchase holds a database connection for its whole transaction and 50 phones share 10 connections. To be sure, rerun scenario (c) on a quiet machine.

**First open (a full copy) is the expensive request.** One costs about 30 ms and sends about 180 kB (needed items, two months of purchases, 176 products, 104 trips). Twenty at the same moment take about 200–450 ms each, because the work is mostly in the one Node process (building and sending the answer), not in the database. Phones only do this on first open, after a reinstall, or when they fall behind the clean-up window, so it is not part of the pass mark; but if many phones ever open at once (after a release), this is the request that will queue.

### Step 12 against its "done when"

| Target | Result |
| --- | --- |
| "Nothing changed" reads 3 pages | 3 pages |
| History page of 30 reads about 34 pages | 179 (note A: the trip-month rule adds 4 pages per row; 39 for the items themselves) |
| Load test: no errors, 95% under 200 ms | Met in every run except two runs of (c) slowed by other work on this machine (above) |
| Index problems found | One, fixed in migration 032 with a test |

## 6. Reading list

Added as each decision is discussed.

### D1: read paths and paging

- Use The Index, Luke, "Paging through results": https://use-the-index-luke.com/no-offset
- PostgreSQL manual, "Multicolumn indexes": https://www.postgresql.org/docs/current/indexes-multicolumn.html
- TanStack Query, "Infinite queries": https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries

### D2: data model

- Denormalization (why you sometimes store a number you could calculate): https://en.wikipedia.org/wiki/Denormalization
- PostgreSQL manual, `INSERT ... ON CONFLICT` (insert a row or update it if it exists): https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT

### D2: what stays on the phone

- Android developers, "Build an offline-first app" (the ideas apply to any platform): https://developer.android.com/topic/architecture/data-layer/offline-first
- TanStack Query, "persistQueryClient" (how the cache is saved today): https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient
- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/

### D2a: SQLite on the phone

- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- SQLite, "Appropriate uses": https://www.sqlite.org/whentouse.html

### D3: indexes

- Use The Index, Luke, "Anatomy of an index": https://use-the-index-luke.com/sql/anatomy
- PostgreSQL manual, "Using EXPLAIN": https://www.postgresql.org/docs/current/using-explain.html
- PostgreSQL manual, "Partial indexes": https://www.postgresql.org/docs/current/indexes-partial.html
- PostgreSQL manual, "Indexes and ORDER BY": https://www.postgresql.org/docs/current/indexes-ordering.html

### D4: photos

- Cloudflare R2, "How R2 works": https://developers.cloudflare.com/r2/how-r2-works/
- AWS, "What is object storage?": https://aws.amazon.com/what-is/object-storage/
- Expo Image (placeholders, caching): https://docs.expo.dev/versions/latest/sdk/image/

### D5: retention and plans

- RevenueCat, "Entitlements" (how apps model what a plan unlocks): https://www.revenuecat.com/docs/getting-started/entitlements
- Apple, "Auto-renewable subscriptions" (the rules a store app must follow): https://developer.apple.com/app-store/subscriptions/
- PostgreSQL manual, "Routine vacuuming" (what happens to disk space after large deletes): https://www.postgresql.org/docs/current/routine-vacuuming.html

### D6: sync

- PostgreSQL manual, "Transaction isolation" (why two transactions can commit out of order): https://www.postgresql.org/docs/current/transaction-iso.html
- PostgreSQL manual, "Explicit locking", section on row-level locks: https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS
- MDN, "Using server-sent events": https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- PostgreSQL manual, `NOTIFY`: https://www.postgresql.org/docs/current/sql-notify.html

### D7: server and hosting

- The Twelve-Factor App, "Processes" (why a server should keep no state in memory): https://12factor.net/processes
- Render, "Regions": https://render.com/docs/regions
- Render, "Deploy for free" (what the free plan does and does not do): https://render.com/docs/free
- PostgreSQL manual, "Advisory locks": https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

### D8: app performance

- React Native, "Performance overview": https://reactnative.dev/docs/performance
- React Native, "Optimizing FlatList configuration": https://reactnative.dev/docs/optimizing-flatlist-configuration
- TanStack Query, "Render optimizations": https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations
- React, "Passing data deeply with context": https://react.dev/learn/passing-data-deeply-with-context

### D9 and D10

- PostgreSQL manual, `pg_stat_statements`: https://www.postgresql.org/docs/current/pgstatstatements.html
- Martin Fowler, "Parallel Change" (add the new, move over, remove the old): https://martinfowler.com/bliki/ParallelChange.html
