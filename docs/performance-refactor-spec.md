# One More Thing: performance refactor, implementation spec

Status: **approved by the owner on 2026-11-23, ready to build, nothing built yet.** Starting point: commit `6f31097` (app version 2.9.2).

The build thread starts from [IMPLEMENTATION-HANDOFF.md](IMPLEMENTATION-HANDOFF.md), which holds the working rules and the step-by-step plan.

This file says exactly what changes. How each decision was reached, with the measurements and the reading list, is in [performance-refactor-decisions.md](performance-refactor-decisions.md). The History design is in [history-redesign-mockup.html](history-redesign-mockup.html) and the icon design for categories and shops in [icons-mockup.html](icons-mockup.html) (open them in a browser). The test database used for the measurements is described in [perf-lab/README.md](perf-lab/README.md).

## 1. Summary

| Area | Today | After |
| --- | --- | --- |
| List read | Every item of the home, bought ones included, on every read | Needed items, plus purchases of this month and last month |
| Refresh | The full list every 3 to 5 seconds on trip screens | "What changed since version N": 3 pages read when nothing changed (about 700 today) |
| History | All of it on the phone, filtered there | Pages of 30 from the server, by cursor, one index |
| Month totals, budget | Added up on the phone | Summed by the server for kept months, stored once for cleaned months |
| Suggestions, last price | Scanned from the full history | A small `home_products` table, copied to the phone |
| Trips (invoices) | A row only when named or priced; otherwise guessed on the phone | Every trip is a row |
| Photos | Bytes in Postgres, one size, through the API | Object storage (R2), two sizes, a blurred placeholder |
| History kept | Forever | 12 months for every home for now; the limit comes from the home's plan |
| Server sleep | Sleeps after 15 idle minutes; 22 s to wake | A request every 5 minutes keeps it awake |
| Phone storage | One JSON text, rewritten on each change | SQLite tables (last step) |
| History screens | Range menu, flat list | "Month hero" purchases, "Receipt cards" invoices |
| Icons | None: a category and a shop are only names | Every category and every shop has an icon: a default, an emoji the home picks, or an image the home uploads |

Release shape: the backend deploys first and keeps every old endpoint, so version 2.9.2 keeps working. The app side ships once, as one new APK, version **2.9.3**.

## 2. Choices made while writing this spec

These go beyond, or differ from, what was discussed. The owner approved all ten on 2026-11-23.

| # | Choice | Why |
| --- | --- | --- |
| C1 | **The database stamps the change counter, with a trigger**, not the application code. | `items.service.ts` changes items in more than twenty places, several with hand-written SQL. A trigger cannot miss one. Tested in the lab: all cases pass; cost 0.06 ms per written row. |
| C2 | **Deletion markers live in their own table** (`home_deletions`); deleted rows are still removed. | Keeping deleted rows in `items` would force a `deleted_at is null` filter into every existing query. |
| C3 | **Photos are served through signed addresses, not a public address.** This changes D4. | Cloudflare states a public bucket needs a custom domain for production use; the free `r2.dev` address is rate limited and for development only. There is no domain yet. The API answers `GET /item-images/:id` with a redirect to an address valid for one hour. No cost, and no change to who can see a photo. Switch to a public address when a domain exists. |
| C4 | **Trips reuse the `trip_receipts` table.** Item counts and item totals are computed by the query, not stored. | No rename to carry through the code, and no stored number that can drift. |
| C5 | **`homes.timezone`** is added. | The server now decides where a month starts. It must use the home's clock, not the server's. |
| C6 | **History is browsed by month.** The Today, This week, All time and pick-a-date choices are removed. Days are still shown as groups inside the month. The list filter and search stay. | The chosen design is month based, and month is also the unit of loading and of retention. |
| C7 | **The recap screen loads its two months when opened**, and keeps its current code. | It compares a month with the one before, which can fall outside the phone's two-month window. |
| C8 | **Purchases and Invoices keep the month controls of the designs chosen** (arrows on Purchases, chips on Invoices) and share one selected month. | As chosen. Using one control on both pages would be more consistent; say so if you prefer that. |
| C9 | **The `early` plan has no photo limit.** | No current user should meet a new limit before billing exists. |
| C10 | **The SQLite move is the last task and has a cut line** (section 9). | It rewrites the offline layer. Everything else in 2.9.3 works without it, so it can move to 2.9.4 if testing finds problems. |

New backend packages, approved by the owner on 2026-11-23: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `thumbhash`. No new app packages are planned; any other new package needs the owner's approval first.

## 2b. Changes made during the build

The build followed this spec; where it had to differ, the reason is in `docs/build-progress.md` ("Differences from the spec"). The ones that change a contract:

- **Changes answer:** small sets (home with members, lists, categories, icons, pins, sets, asks, locks) are sent whole whenever anything changed; only items, products and trips come as changes, and `deleted` lists only those three kinds. Expired shop locks are removed by the request itself. A changed trip resends its items.
- **Access:** someone outside a home gets 403 (the API's existing rule), not 404.
- **Item rows** also carry `sortOrder` and `imageHash`.
- **History:** a purchase belongs to the month its trip started (lists and totals alike); no CSV export endpoint (the app builds the CSV from `history/purchases` pages); no "Scanned" tag.
- **Photos:** `STORAGE_DRIVER` defaults to `db` (photos stay in Postgres until R2 is configured); keys are `homes/<homeId>/photos/<imageId>/{full,thumb}.jpg`; deleted photos' files are listed in `storage_trash` by a trigger and removed by the daily job (no bucket listing).
- **Icons:** one module and table (`home_icons`) for categories and shops; in `db` mode the image is kept in the row.
- **Clean-up job** also removes expired sign-in tokens, email codes and finished questions.
- **App storage (D2a):** SQLite holds the saved copy row by row; screens keep reading the in-memory cache.
- **Migrations** run one transaction each.

## 3. Database

All migrations are additive. Version 2.9.2 keeps working after each one. Files continue the existing numbering in `backend/src/database/migrations/` and are registered in `backend/src/app.module.ts`.

### 3.1 Migration 025 `SyncVersions`

```sql
alter table homes
  add column version bigint not null default 0,
  add column sync_floor bigint not null default 0,
  add column timezone text;

alter table items                   add column version bigint not null default 0;
alter table lists                   add column version bigint not null default 0;
alter table staples                 add column version bigint not null default 0;
alter table item_sets               add column version bigint not null default 0;
alter table custom_home_categories  add column version bigint not null default 0;
alter table trip_receipts           add column version bigint not null default 0;

create table home_deletions (
  home_id    uuid        not null references homes (id) on delete cascade,
  entity     text        not null,
  entity_id  uuid        not null,
  version    bigint      not null,
  deleted_at timestamptz not null default now(),
  primary key (home_id, version)
);
-- The clean-up job removes markers by age.
create index home_deletions_deleted_at_idx on home_deletions (deleted_at);

-- Rows that carry their own version: stamps the row, or leaves a marker on delete.
create function omt_stamp_version() returns trigger language plpgsql as $$
declare v bigint;
begin
  if current_setting('omt.skip_sync', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    update homes set version = version + 1 where id = old.home_id returning version into v;
    -- v is null while the home itself is being deleted: no marker is needed then.
    if v is not null then
      insert into home_deletions (home_id, entity, entity_id, version)
      values (old.home_id, tg_argv[0], old.id, v);
    end if;
    return old;
  end if;
  update homes set version = version + 1 where id = new.home_id returning version into v;
  new.version := v;
  return new;
end $$;

-- Small sets sent whole: only moves the home's counter.
create function omt_bump_home() returns trigger language plpgsql as $$
begin
  if current_setting('omt.skip_sync', true) = 'on' then return null; end if;
  update homes set version = version + 1 where id = coalesce(new.home_id, old.home_id);
  return null;
end $$;

-- A change to the home's own settings moves its counter too.
create function omt_home_version() returns trigger language plpgsql as $$
begin
  if new.version = old.version then new.version := old.version + 1; end if;
  return new;
end $$;

create trigger homes_version before update on homes
  for each row execute function omt_home_version();

create trigger items_version before insert or update or delete on items
  for each row execute function omt_stamp_version('item');
create trigger lists_version before insert or update or delete on lists
  for each row execute function omt_stamp_version('list');
create trigger staples_version before insert or update or delete on staples
  for each row execute function omt_stamp_version('pin');
create trigger item_sets_version before insert or update or delete on item_sets
  for each row execute function omt_stamp_version('set');
create trigger custom_categories_version before insert or update or delete on custom_home_categories
  for each row execute function omt_stamp_version('category');
create trigger trips_version before insert or update or delete on trip_receipts
  for each row execute function omt_stamp_version('trip');

create trigger hidden_categories_bump after insert or delete on hidden_home_categories
  for each row execute function omt_bump_home();
create trigger members_bump after insert or update or delete on home_members
  for each row execute function omt_bump_home();
-- Not on update: the heartbeat every 15 s must not count as a change.
create trigger shop_locks_bump after insert or delete on list_shop_locks
  for each row execute function omt_bump_home();
create trigger shop_asks_bump after insert or update or delete on shop_asks
  for each row execute function omt_bump_home();

-- "What changed since N" for items. Built without locking writes.
create index concurrently items_home_version_idx on items (home_id, version);
```

How it behaves (all tested in the lab on 2026-11-23):

- An insert or update gives the row the home's next number. An update of five rows gives five consecutive numbers.
- A delete leaves one row in `home_deletions` with the next number.
- Deleting a whole home does not fail and leaves no markers.
- With `set local omt.skip_sync = 'on'` inside a transaction, nothing is stamped and no marker is written. Only the clean-up job uses this.
- Two changes in one home wait for each other, because both update the same `homes` row. Numbers can never be handed out, or become visible, out of order.

Notes for the build:

- `create index concurrently` cannot run inside a transaction. That migration sets `transaction = false` (TypeORM migration property).
- Existing rows keep version 0. Every phone starts with a full copy (section 4.1), so no backfill is needed.
- An `insert … on conflict` that ends as an update or as nothing still fires the insert trigger and moves the home's counter. That is harmless: phones ask once and get no rows.
- `homes.timezone` is filled by the app: the first request from a member of a home with no timezone stores the phone's IANA zone (for example `Asia/Amman`). Until then the server uses `Asia/Amman`.

### 3.2 Migration 026 `HistoryIndex`

```sql
-- History pages, month totals, the phone's two-month window, clean-up per home.
create index concurrently items_home_bought_idx
  on items (home_id, bought_at desc, id desc)
  where status = 'bought';
```

Measured: a History page of 30 reads 34 pages with it, 727 without.

### 3.3 Migration 027 `TripsAsRows`

```sql
alter table trip_receipts
  add column started_at     timestamptz,
  add column last_bought_at timestamptz;

-- Existing invoices take their times from their items.
update trip_receipts r
set started_at     = coalesce(x.first_at, r.created_at),
    last_bought_at = coalesce(x.last_at,  r.created_at)
from (select receipt_id, min(bought_at) as first_at, max(bought_at) as last_at
      from items where receipt_id is not null group by receipt_id) x
where x.receipt_id = r.id;
update trip_receipts set started_at = created_at, last_bought_at = created_at where started_at is null;

-- Purchases with no invoice are grouped the way the app groups them today:
-- same home and list, each bought within 90 minutes of the one before.
create temp table trip_seed_item on commit drop as
with loose as (
  select id, home_id, list_id, bought_at,
         case when lag(bought_at) over w is null
                or bought_at - lag(bought_at) over w > interval '90 minutes' then 1 else 0 end as starts
  from items
  where status = 'bought' and receipt_id is null and bought_at is not null
  window w as (partition by home_id, list_id order by bought_at, id)
)
select id as item_id, home_id, list_id, bought_at,
       sum(starts) over (partition by home_id, list_id order by bought_at, id) as grp
from loose;

create temp table trip_seed_trip on commit drop as
select home_id, list_id, grp, gen_random_uuid() as trip_id,
       min(bought_at) as started_at, max(bought_at) as last_bought_at
from trip_seed_item group by home_id, list_id, grp;

insert into trip_receipts (id, home_id, list_id, created_at, started_at, last_bought_at)
select trip_id, home_id, list_id, started_at, started_at, last_bought_at from trip_seed_trip;

update items i set receipt_id = t.trip_id
from trip_seed_item s join trip_seed_trip t using (home_id, list_id, grp)
where i.id = s.item_id;

alter table trip_receipts
  alter column started_at set not null,
  alter column last_bought_at set not null;

create index trip_receipts_home_started_idx on trip_receipts (home_id, started_at desc, id desc);
drop index if exists trip_receipts_home_idx;
```

Tested in the lab: three trips of four items and one lone purchase become four trips, and no bought item is left without a trip.

This migration runs with `set local omt.skip_sync = 'on'` so it does not stamp every row.

After it, every bought item has a `receipt_id`. The meaning of `trip_receipts.total` does not change: null means "no trip total entered; the items' own prices count".

### 3.4 Migration 028 `HomeProducts`

```sql
create table home_products (
  id             uuid primary key default gen_random_uuid(),
  home_id        uuid not null references homes (id) on delete cascade,
  name_key       text not null,           -- the name, normalised (see below)
  name           text not null,           -- as last typed
  category       text not null,
  unit           text,
  last_cost      numeric(12,3),           -- price of the last purchase that had one
  last_cost_qty  numeric(10,2),           -- its quantity, so the app can work out the price of one
  last_cost_unit text,
  last_cost_at   timestamptz,
  last_bought_at timestamptz not null,
  times_bought   integer not null default 1,
  version        bigint not null default 0,
  unique (home_id, name_key)
);
create trigger home_products_version before insert or update or delete on home_products
  for each row execute function omt_stamp_version('product');
create index home_products_home_version_idx on home_products (home_id, version);
```

`name_key` must match the app's `normalizeName` (`frontend/features/items/utils/insights.ts`): trim, lower case, remove Arabic diacritics and tatweel (`U+064B` to `U+0652`, `U+0640`), collapse spaces. The server gets the same function in `backend/src/modules/items/utils/name-key.ts`, with a shared list of test names in both test suites.

Filled once from existing purchases, in the same migration, with `omt.skip_sync` on: one row per home and `name_key`, taking the newest purchase for name, category, unit and `last_bought_at`, the newest priced purchase for the `last_cost` columns, and the count for `times_bought`.

### 3.5 Migration 029 `PlansAndMonthStats`

```sql
alter table homes
  add column plan            text        not null default 'early',
  add column plan_until      timestamptz,
  add column plan_changed_at timestamptz not null default now();

-- Written once per month by the clean-up job, just before it deletes that month.
create table home_months (
  home_id      uuid    not null references homes (id) on delete cascade,
  month        date    not null,            -- first day of the month, home's timezone
  item_count   integer not null,
  priced_count integer not null,
  trip_count   integer not null,
  spend        numeric(14,3) not null,
  primary key (home_id, month)
);
create table home_month_categories (
  home_id    uuid    not null,
  month      date    not null,
  category   text    not null,
  item_count integer not null,
  spend      numeric(14,3) not null,
  primary key (home_id, month, category),
  foreign key (home_id, month) references home_months (home_id, month) on delete cascade
);
```

### 3.6 Migration 030 `PhotoStorage`

```sql
alter table item_images
  alter column data drop not null,
  add column storage     text    not null default 'db',   -- 'db' or 'object'
  add column bytes       integer,
  add column thumb_bytes integer,
  add column thumbhash   text;
update item_images set bytes = octet_length(data) where data is not null;
create index item_images_home_idx on item_images (home_id);
```

### 3.7 Migration 031 `HomeIcons`

Added to the plan on 2026-11-23, after the rest was approved. One table serves both kinds of icon.

```sql
create table home_icons (
  home_id     uuid not null references homes (id) on delete cascade,
  kind        text not null check (kind in ('category', 'shop')),
  key         text not null,     -- category: its id ('meat' or a custom category's uuid)
                                 -- shop: the trip name, normalised with the name-key function
  label       text,              -- shop only: the name as last typed, for display
  emoji       text,              -- one emoji, or null
  image_id    uuid,              -- random id of the uploaded image, or null
  image_bytes integer,
  updated_by  uuid references users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (home_id, kind, key),
  check (emoji is null or image_id is null),
  check (emoji is not null or image_id is not null)
);
-- A small set, sent whole with every change answer.
create trigger home_icons_bump after insert or update or delete on home_icons
  for each row execute function omt_bump_home();
```

A row exists only when a home changed an icon. No row means the default icon. Items keep storing the category id, and trips keep storing their name, exactly as today.

A shop's icon belongs to the **shop name**, not to one trip: every trip named "Carrefour", past and future, shows the icon set for "Carrefour". A trip with no name shows the default.

### 3.8 Later migration `CleanUp` (after 2.9.2 is retired, section 10)

```sql
alter table item_images drop column data;
drop index items_home_status_idx;
create index items_home_needed_idx on items (home_id) where status = 'needed';
```

`items_list_created_idx` (318 MB in the lab, used by one count in `countAddedSince`) is reviewed at the same time.

## 4. Backend

### 4.1 Sync: `GET /api/homes/:homeId/changes`

New module `backend/src/modules/sync/` (controller, service, repository, DTOs), following the layout of the existing modules.

Request: `?since=<whole number>`, optional. Signed-in member of the home.

Response `200`:

```json
{
  "version": 43,
  "full": false,
  "home": { "id": "…", "name": "…", "plan": { "id": "early", "until": null, "limits": { "historyMonths": 12, "photosPerHome": null, "iconImages": 100, "sets": 20, "pinsPerList": 30 } }, "…": "the fields the home endpoint returns today" },
  "lists": [],
  "items": [],
  "products": [],
  "trips": [],
  "pins": [],
  "sets": [],
  "categories": { "custom": [], "hidden": [] },
  "icons": [],
  "members": [],
  "locks": [],
  "asks": [],
  "deleted": [ { "type": "item", "id": "…" } ]
}
```

Rules:

1. Read `homes.version` and `homes.sync_floor` by primary key. If `since` equals the version, answer `{ "version": N, "full": false }` and stop. This is the common case and reads one row.
2. If `since` is missing, greater than the version, or below `sync_floor`, answer a **full copy** with `"full": true`: every list, pin, set, category, product and member; every needed and parked item; bought items and trips inside the window; no `deleted`.
3. Otherwise answer only rows whose `version` is greater than `since`, plus `deleted` from `home_deletions`.
4. The window is "bought on or after the first day of last month, in the home's timezone". Bought items and trips outside it are left out of the answer.
5. `home`, `categories.hidden`, `icons`, `members`, `locks` and `asks` are small and are sent whole in every non-empty answer.
6. The whole answer is read inside one `repeatable read` transaction, so `version` and the rows agree.
7. Item rows have exactly the shape the existing items endpoint returns (`ItemResponse`), built by the same `withNames` code.

The app stores `version` as its next `since`.

The sets and pins limits shown in `limits` are today's `SET_LIMIT` and `PIN_LIMIT` values; the example numbers above are placeholders for them.

### 4.2 History

All under `backend/src/modules/history/`. Every read is cut at the plan's window: `bought_at >= start of month (home timezone) minus historyMonths`.

**`GET /api/homes/:homeId/history/purchases`**

| Parameter | Meaning |
| --- | --- |
| `month` | `YYYY-MM`. Required unless `q` is given. |
| `listId`, `category` | Optional filters. |
| `q` | Search text. Searches every kept month; `month` is ignored. |
| `before` | Cursor from the previous page. |
| `limit` | Default 30, capped at 100 by the server. |

```json
{ "items": [ "…ItemResponse…" ], "next": "2026-11-21T17:40:12.000Z_7c1e…" }
```

The cursor is the last row's `bought_at` and `id`. The query:

```sql
select … from items
where home_id = $1 and status = 'bought'
  and bought_at >= $monthStart and bought_at < $monthEnd
  and (bought_at, id) < ($cursorAt, $cursorId)        -- only when a cursor is given
order by bought_at desc, id desc
limit $limit + 1;                                      -- one extra row tells whether there is a next page
```

Search adds `and name ilike '%' || $q || '%'` (with `%` and `_` escaped) over the whole kept range. Measured: 530 pages for one active home, no extra index needed.

**`GET /api/homes/:homeId/history/trips`**: same `month`, `listId`, `before`, `limit` (default 20, cap 50), paged on `(started_at, id)`.

```json
{ "trips": [ { "id": "…", "name": "Carrefour", "listId": "…", "listName": "Weekly", "startedAt": "…",
               "total": 14.2, "itemCount": 7, "pricedCount": 7, "itemsTotal": 14.2, "scanned": true,
               "preview": [ { "name": "Tomatoes", "category": "vegetables", "imageId": null } ] } ],
  "next": null }
```

`itemCount`, `pricedCount` and `itemsTotal` are computed from the trip's items in the same query (`items_receipt_idx`). `preview` is the first three items. `scanned` needs a stored fact that does not exist today; if the receipt scan leaves no trace in the database, the tag is dropped from the card (to check during build).

**`GET /api/homes/:homeId/history/trips/:tripId`**: the trip and all its items.

**`GET /api/homes/:homeId/history/months/:month`**

```json
{ "month": "2026-11", "state": "live", "itemCount": 54, "pricedCount": 50, "tripCount": 6, "spend": 186.4,
  "categories": [ { "category": "meat", "itemCount": 9, "spend": 48.0 } ],
  "budget": 300 }
```

- `state` is `live` (summed from `items` now), `archived` (read from `home_months`), or `none`.
- `spend` follows the app's `summarizeSpend` rule (`frontend/features/items/utils/currency.ts`): a trip with a total counts that total once and all its items as priced; any other item counts its own cost. The server implements the same rule in SQL and shares test cases with the app.
- Per category, an item inside a totalled trip counts its own cost if it has one, otherwise nothing; the trip's remainder is reported under the category `""` (shown as "Trip totals"). This is the one place where the server shows more than the app does today.

**`GET /api/homes/:homeId/history/months`**: the list of months that have anything, newest first, with `state` and `spend`. The month controls use it.

**`GET /api/homes/:homeId/history/export?month=YYYY-MM&listId=`**: a CSV file with the columns `purchasesToCsv` writes today, streamed.

### 4.3 Writing: mark bought, undo, price changes

Changes to `backend/src/modules/items/services/items.service.ts`:

- **Mark bought** (`markBought`, bulk `items/bought`), in one transaction:
  1. Mark the item bought (as today).
  2. Attach it to a trip: the `receiptId` in the request if given; otherwise the newest trip of the same home and list whose `last_bought_at` is within 90 minutes before the purchase; otherwise a new trip row. Set the trip's `last_bought_at`.
  3. Upsert `home_products`: `insert … on conflict (home_id, name_key) do update` setting name, category, unit, `last_bought_at`, `times_bought = times_bought + 1`, and the `last_cost` columns when the purchase has a cost.
- **Undo** (`items/:id/needed`): as today, plus `times_bought - 1`; if it reaches 0 the product row is deleted, otherwise its `last_` columns are recomputed from the newest remaining purchase of that name. The existing `deleteIfEmpty` removes a trip left empty.
- **Price change** (`items/:id/cost`): as today, plus the product's `last_cost` columns when this is the newest priced purchase of that name.
- Remove `releasedOnReadAt` and the release-on-read call from `list()`; the scheduler already releases parked items.
- `GET /api/homes/:homeId/items` stays exactly as it is, for 2.9.2.

No code is added to stamp versions: the triggers do it (C1).

### 4.4 Plans

`backend/src/modules/plans/plans.ts`:

```ts
export const PLANS = {
  early: { historyMonths: 12, photosPerHome: null, iconImages: 100, sets: SET_LIMIT, pinsPerList: PIN_LIMIT },
  // free and paid are added with the store release.
} as const;
```

- `PlansService.limitsFor(home)` returns the limits of `home.plan`; a plan whose `plan_until` has passed counts as the default plan.
- `sets.service.ts` and `pins.service.ts` read their limit from it instead of the constants.
- The home response gains `plan: { id, until, limits }`.
- A home's plan is changed by updating `plan`, `plan_until` and `plan_changed_at` by hand for now. The billing service will do the same update later.

### 4.5 Clean-up job

`backend/src/modules/maintenance/`: a service and `POST /api/internal/maintenance/run`, protected by `CRON_SECRET` like the pins endpoint, called once a day by a new GitHub workflow. It takes the advisory lock (4.8) first.

For each home, in batches of 500 by id:

1. Skip the home if `plan_changed_at` is less than 30 days ago (the grace period).
2. `cutoff` = first day of the current month in the home's timezone, minus `historyMonths`.
3. One index probe: any bought item with `bought_at < cutoff`? If none, next home.
4. For each month before the cutoff, in one transaction with `set local omt.skip_sync = 'on'`:
   1. Insert the month's totals into `home_months` and `home_month_categories` (`on conflict do nothing`).
   2. Collect the `image_id` of the month's items.
   3. Delete the items, at most 1,000 per statement.
   4. Delete trips of the home that have no items left.
   5. After commit, delete the collected photos' files from storage.

Also, once per run: delete `home_deletions` rows older than 60 days and raise each affected home's `sync_floor` to the highest deleted version; delete storage files that no `item_images` row points to (list by prefix, compare, delete); delete expired refresh tokens and email codes if the existing code does not already.

`home_products` is never cleaned.

### 4.6 Photos

`backend/src/shared/storage/`:

```ts
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(keys: string[]): Promise<void>;
  list(prefix: string): AsyncIterable<string>;
  signedUrl(key: string, seconds: number): Promise<string>;
}
```

Two drivers chosen by `STORAGE_DRIVER`: `fs` (a local folder, for development and tests; `signedUrl` returns a local API address) and `s3` (R2). New environment variables: `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_REGION` (`auto` for R2), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, added to `backend/src/config/env.ts`, `.env.example`, `docker-compose.yml` and `render.yaml`.

Keys: `homes/<homeId>/<imageId>/full.jpg` and `homes/<homeId>/<imageId>/thumb.jpg`. Never stored; always built from ids.

Upload (`item-images.service.ts`, `set`): validate as today; with `sharp` produce `full` (1280 px, as today) and `thumb` (256 px on the long side, JPEG); compute the `thumbhash` from a 100 px RGBA copy; `put` both files; then write the row (`storage = 'object'`, `bytes`, `thumb_bytes`, `thumbhash`, no `data`) and point the item at it in the existing transaction; then delete the previous photo's files. If the row write fails, delete the two new files.

Download: `GET /api/item-images/:imageId?size=thumb|full` (default `full`).

- `storage = 'object'`: `302` to `signedUrl(key, 3600)`, with `Cache-Control: private, max-age=3000` on the redirect.
- `storage = 'db'`: the bytes, as today (`thumb` returns the full image).

Item rows in every response gain `imageHash` (the `thumbhash`) beside `imageId`.

Copy of existing photos: `POST /api/internal/maintenance/copy-photos`, protected by `CRON_SECRET`, called once after the deploy. It runs inside the server, so the storage keys never leave Render. For each row with `storage = 'db'` (at most 50 per call; the answer says how many remain): produce both sizes and the hash from `data`, `put`, read the file back and compare its size, then set `storage = 'object'` and `data = null`. It can be called again safely.

The storage keys are secrets. The owner types them into Render's environment settings; they are never pasted into a chat, a file in the repository, or a commit. Local development and tests use the `fs` driver and need no keys.

Deleting an item, a home or a photo deletes its files (home: by prefix). The daily job catches anything missed.

### 4.7 Icons for categories and shops

New `backend/src/modules/icons/` (controller, service, repository). Any member of the home may change an icon, the same rule as adding a category or renaming a trip today.

| Endpoint | Does |
| --- | --- |
| `PUT /api/homes/:homeId/icons` with `{ "kind": "category", "key": "meat", "emoji": "🍗" }` or `{ "kind": "shop", "name": "Carrefour", "emoji": "🏬" }` | Sets an emoji and removes any uploaded image. |
| `PUT /api/homes/:homeId/icons/image` (multipart: `kind`, `key` or `name`, `file`) | Stores an uploaded image and removes any emoji. |
| `DELETE /api/homes/:homeId/icons` with `kind` and `key` or `name` | Back to the default icon. |
| `GET /api/icons/:imageId` | Redirects to a signed address, like item photos. |

Rules:

- Category: `key` must be a category the home can use (the existing `assertUsable` check).
- Shop: the app sends the `name`; the server stores `key` = the name-key function of it (section 3.4) and `label` = the name trimmed. An empty name is rejected.
- Emoji: exactly one visible character (one grapheme, checked with `Intl.Segmenter`) that is an emoji (`\p{Extended_Pictographic}` or a flag), at most 32 bytes.
- Image: the same format and size checks as item photos. `sharp` crops it to a centred square, resizes to 192 px and saves WebP, which keeps transparency. One file per icon: `homes/<homeId>/icons/<imageId>.webp`. A new upload gets a new random `imageId`; the old file is deleted.
- At most 100 icons with an uploaded image per home (`limits.iconImages` in the plan table, section 4.4). Emoji icons are not limited.
- Removing a custom category also deletes its icon row and file. Shop icons stay when their trips are cleaned, like products do. The daily job deletes icon files nothing points to.
- The changes answer carries the whole set as `icons: [ { "kind", "key", "label", "emoji", "imageId" } ]`. `GET /api/homes/:homeId/icons` returns the same list. Version 2.9.2 never asks for it.

Tests: set, replace and reset an emoji for each kind; reject two characters and plain letters; upload, replace and reset an image; the old file is gone; the 100-image limit; another home's member gets `404`; deleting a category removes its icon; "carrefour", " Carrefour " and "CARREFOUR" are one shop; the change moves the home's counter.

### 4.8 Server housekeeping

- **Advisory lock:** `pins.scheduler.ts` and the maintenance job run only if `select pg_try_advisory_lock(<job number>)` returns true, and unlock afterwards.
- **Health:** `GET /api/health` runs `select 1` and answers `503` if it fails.
- **Keep awake:** `.github/workflows/pins-tick.yml` schedule becomes `*/5 * * * *`. A free uptime monitor requesting `/api/health` every 5 minutes is set up by the owner as the more reliable pinger.
- **Request log:** a Nest interceptor writes one line per request: method, route pattern, status, milliseconds. `backend/scripts/slow-routes.mjs` reads a saved log and prints count, median and 95th percentile per route.
- **Slow queries:** `maxQueryExecutionTime: 200` in the TypeORM options.
- **`pg_stat_statements`:** `create extension if not exists pg_stat_statements` in a migration, wrapped so a refusal does not fail the deploy.
- **Database access:** after confirming `DATABASE_URL` is the internal address, remove `0.0.0.0/0` from the database's allowed addresses in Render. Done by the owner or on request.

### 4.9 Backend tests

Jest, beside the existing `*.spec.ts` files. Each bullet is at least one test.

- Triggers: insert, update, bulk update, delete, home delete, skip flag, heartbeat does not bump.
- Changes: nothing changed; a few rows; a deletion; `since` below `sync_floor` gives a full copy; a bought item outside the window is left out; a member of another home gets `404`.
- History pages: order, cursor across equal timestamps, last page, month edges in a non-UTC timezone, list and category filters, search, the plan window, the page-size cap.
- Month totals: the shared `summarizeSpend` cases; `live` and `archived` agree for the same data.
- Trips: attach within 90 minutes, new trip after 90, explicit `receiptId`, undo removes an empty trip.
- Products: first purchase, repeat purchase, price update, undo to zero, Arabic names with and without diacritics map to one row.
- Clean-up: a month is archived then deleted; grace period respected; products untouched; photos' files deleted; markers purged and `sync_floor` raised.
- Photos: upload writes two files and the hash; replace deletes the old files; redirect for `object`, bytes for `db`; the copy endpoint on a sample.
- Old endpoints: the existing suites pass unchanged.

## 5. App

### 5.1 Sync engine

New folder `frontend/features/sync/`.

- `api.ts`: `fetchChanges(homeId, since)`.
- `cursor.ts`: reads and writes the home's last version in the existing storage (`sync.version.<homeId>`).
- `apply.ts`: merges an answer into the TanStack Query cache with `setQueryData`: upsert rows by id, remove ids listed in `deleted`, replace the whole-set parts. A full copy replaces everything for that home. When the answer has no rows, **no cache entry is touched**, so nothing redraws.
- `engine.ts`: `syncNow(homeId)`, one run at a time per home. Called when the app comes to the foreground, on pull to refresh, after the outbox sends a change, and by the trip-screen timers that exist today (same intervals: 5 s alone, 3 s together).

What it replaces:

| Today | After |
| --- | --- |
| `refresh()` in `use-purchases.tsx` loading every item | `syncNow` |
| The lock poll every 3 s (`use-shop-lock.ts`) | Locks arrive with changes; the heartbeat `POST` stays |
| The asks poll every 15 s (`use-shop-asks.ts`) | Asks arrive with changes |
| `fetchLists`, `fetchHistoryLists`, pins, sets, categories reads on focus | Arrive with changes |

Pending changes keep their current path (the outbox and its client-made ids). After a change is sent, `syncNow` brings the server's result.

`PurchasesContext.bought` now holds only the two-month window. Its users change as follows:

| User | Change |
| --- | --- |
| Suggestions (`add-item-card.tsx`, `items-screen.tsx:289`) | `suggestItems` reads the products list. Its ranking is unchanged. |
| Last prices (`trip-screen.tsx:267`, `sets-screen.tsx:130`) | `lastPrices` reads the products list. |
| Saved shop names (`trip-screen.tsx:1350`) | Trip names in the cache (the window). |
| Month forecast on a trip (`trip-screen.tsx:298`) | Month totals query. |
| Spending summary, recap card | Month totals query. |
| Recap screen | Loads its two months through the history endpoint when opened (C7). |
| Trip helpers (`tripDoneItems`, session lists) | Unchanged: they read today's purchases, always inside the window. |

### 5.2 History and Invoices screens

Design: [history-redesign-mockup.html](history-redesign-mockup.html). The file is the reference for layout, motion and states.

Files: `history-screen.tsx` (1,374 lines) is split into `features/items/components/history/`: `history-screen.tsx` (pager, header, shared month), `purchases-page.tsx`, `invoices-page.tsx`, `month-hero.tsx`, `category-bar.tsx`, `receipt-card.tsx`, `month-archive-card.tsx`, plus hooks `use-history-purchases.ts`, `use-history-trips.ts`, `use-month-stats.ts` (TanStack `useInfiniteQuery` and `useQuery`).

Kept exactly: the header band, the Purchases/Invoices switch, the swipe between the pages (`Screen` `onSwipe`, `SwipeSlideContent`), the trip detail with rename, move item and cost actions, `ItemDetailCard`, undo and buy again on rows, the fold layout (`FoldSplit`), right-to-left, the theme colours and card style.

Changed:

| Part | Behaviour |
| --- | --- |
| Scrolling | Each page is a `FlatList`; the hero, chips and filters are its header. `keyExtractor` by id; rows are day headers and purchase rows. |
| Month | One selected month shared by both pages. Purchases: arrows beside the month name. Invoices: month chips. Months come from the months endpoint; the newest is the default. |
| Hero (Purchases) | Ring = spend over budget (hidden when the home has no budget), total, item count, export and search buttons. Numbers count up; the ring sweeps. |
| Category bar | One segment per category from the month totals; widths animate on month change. |
| Chips | All, one per category present, and the list filter. Filtering asks the server. |
| List | Pages of 30. Reaching the end loads the next page; two skeleton rows show while it loads. Day headers show the day's total of the loaded rows' day. |
| Invoices | Summary card (trips, total, average), then receipt cards: name or time, list, total, three item icons, count, a tag for unpriced items. Tapping opens the trip as today. |
| Search | The search button opens a field; typing waits 300 ms, then asks the server across all kept months. |
| Cleaned month | The archive card: totals, trips, categories, and "Items from this month are cleaned." |
| Offline | Months already loaded show from the cache; others show "loads when you're back online". This month and last month always work. |
| Removed | The range menu (Today, This week, This month, All time) and the pick-a-date calendar (C6). `history-date-field.tsx` is deleted if nothing else uses it. |

Motion: every new animation is written as `motionOff ? instant : animated` using `useMotionOff`, and existing default motion is not changed. Durations are in the mockup (page slide 300 ms, pill 220 ms, count-up 600 ms, row fade 280 ms). Both settings are cold-start tested.

Day totals in a partly loaded day would be wrong, so a day's total is shown only once all its rows are loaded; the month total always comes from the server.

New text keys are added to `frontend/constants/i18n.ts` in English and Arabic.

### 5.3 Photos

`item-photo.tsx`: list rows request `?size=thumb`; the detail view requests `full`. Each `source` gets `cacheKey: "<imageId>:<size>"` so the cached file survives a new signed address, and `placeholder={{ thumbhash: imageHash }}`. To check on a device during build: that `expo-image` follows the redirect and caches under the `cacheKey`. If it does not, the app asks a small JSON endpoint for the signed address first.

### 5.4 Icons for categories and shops

Design: [icons-mockup.html](icons-mockup.html).

- **Defaults** in `frontend/constants/icons.ts`. Categories: supermarket 🛒, vegetables 🥬, meat 🥩, coffee ☕, pharmacy 💊, other 📦; a custom category starts with 🏷️. Shops: a named trip 🏪, a trip with no name 🛒.
- **One component**, `components/ui/HomeIcon.tsx`: given a kind, a key and a size, it draws the home's image (`expo-image`, `cacheKey` = the image id), or its emoji, or the default. It reads the icons that sync keeps up to date. A shop's key is `normalizeName(trip name)`.
- **One sheet**, `components/ui/IconSheet.tsx`, used for both kinds: a row of suggested emoji, "Any" (a text field that accepts one emoji from the keyboard), "Upload an image" (the existing photo picker, with a square crop), and "Reset to default".
- **Where category icons show:** History purchase rows when the item has no photo of its own; the category chips on History and on the Items filter (`category-filter.tsx`); the category bar legend; the item previews on receipt cards; the cleaned-month card; the category picker in the item form (`item-sheet-form.tsx`); the Categories settings screen.
- **Where shop icons show:** receipt cards on Invoices; the header of an opened trip; the list in the "Move to trip" sheet; the saved shop names offered when a trip is named.
- **Not changed:** the rows of the main Items list.
- **Changing a category icon:** on the Categories settings screen, tap the category's icon.
- **Changing a shop icon:** in an opened trip, tap the icon beside its name. The sheet says the icon applies to every trip with that name. A trip with no name is asked for a name first, through the existing rename sheet.
- An emoji change goes through the outbox, so it works offline. An image upload needs a connection; offline, the button explains that.
- Emoji are drawn by the phone, so the same emoji looks slightly different on a Samsung, a Pixel and an iPhone. An uploaded image looks the same everywhere.
- New text keys in English and Arabic.

Tests: the icon chosen for a key (image over emoji over default); a deleted custom category falls back cleanly; a renamed trip shows its new name's icon; the one-emoji check matches the server's on a shared list of inputs.

### 5.5 Redraws and start-up

- `PurchasesContext` is split in two: data and actions. Actions are stable, so components that only act (buttons, the add bar) stop redrawing when data changes.
- Lists, needed items, parked items and window purchases are read through separate hooks, so a change in one does not redraw users of another.
- The launch intro's `ready` becomes true as soon as the saved copy is restored; it no longer waits for a network answer. A phone with no saved copy waits as today.
- The four fonts are embedded at build time with the `expo-font` config plugin in `app.json`; `useFonts` stays as a fallback.
- Timing marks: app start to first list drawn, saved-copy size and save time, written to the existing log.

### 5.6 SQLite tables (last, cut line C10)

- `frontend/lib/db/`: `open.ts` (one database `omt.db`), `schema.ts` (tables `items`, `lists`, `products`, `trips`, `pins`, `sets`, `categories`, `members`, `month_stats`, `outbox`, `meta`), `migrate.ts` (a numbered version in `meta`; changes are additive; if a migration fails the database is deleted and the next sync makes a full copy).
- `frontend/features/*/repo/*.ts`: the only code that runs SQL. Screens never do.
- `sync/apply.ts` writes rows in one transaction, then invalidates the affected queries; query functions read from the repositories.
- The outbox moves from the saved JSON into the `outbox` table, keeping its order and its ids.
- First run after the update: the old saved copy is read once for any unsent changes, which are moved to the new outbox; then the old key is removed and a full sync runs.
- The session keeps its current storage.

### 5.7 App tests

`node --test`, beside the existing `*.test.ts` files.

- `apply`: upsert, delete, full copy, empty answer leaves the cache object identical.
- Engine: one run at a time; a failed run keeps the old version.
- `suggestItems` and `lastPrices` on products give the same results as today on the same data.
- Month totals shown equal the server's test cases.
- History hooks: page merge, month switch, filter change resets pages, search debounce.
- Name normalisation: the shared list of names.
- SQLite (if included): migration from an empty database, outbox carry-over, a failed migration falls back to a full copy.
- The existing suites pass.

After each change: `npm run test`, `npm run lint`, `npm run typecheck` in `frontend`; `npm test`, `npm run typecheck` in `backend`.

## 6. What users will notice

- History opens on the current month with a spending ring; older months are one tap away.
- Invoices show as receipt cards.
- Every category and every shop has an icon. A home can pick an emoji or upload its own image: for a category in Settings, for a shop inside an opened trip.
- The Today, This week, All time and pick-a-date filters are gone; search now covers everything kept.
- History older than 12 months will be cleaned from September 2027; monthly totals remain.
- Photos appear faster, with a blurred preview first.
- The app opens without the long wait after idle periods, and trip screens stop flickering on refresh.
- Offline: this month and last month are always available; older months need a connection the first time.

"What's new" text for 2.9.3 is written at release time from this list.

## 7. Old versions

- Version 2.9.2 keeps using `GET /homes/:homeId/items` and the old photo address. Both keep working.
- Purchases made by 2.9.2 go through the same `markBought`, so they get trips and products too.
- A 2.9.2 phone and a 2.9.3 phone in the same home see the same data.
- After the clean-up job starts, a 2.9.2 phone no longer sees purchases older than 12 months. None exist before September 2027.
- Old endpoints are removed only after `APP_MIN_VERSION` is raised to 2.9.3 (section 10).

## 8. Measurements to record

Before the build (baseline) and after, in the decision log:

| Measure | Target |
| --- | --- |
| Cold start to a usable Items screen, saved data, on the reference phone | under 2 s |
| Tick an item, tap to visible change | under 100 ms |
| Scroll History with 500 rows | under 5% dropped frames |
| Redraws on an idle trip screen | none |
| "Nothing changed" request, lab | 3 pages (measured) |
| History page of 30, lab | about 34 pages (measured) |
| Load test: 200 phones on changes every 3 s, 50 paging History, 50 marking bought (local API, lab database, Postman CLI) | no errors; 95% under 200 ms |

Reference phone: **Samsung Galaxy A52**, the slowest phone among current users. The first three rows are measured on it, with a release build.

## 9. Build order

One branch. The backend parts are deployed before the APK is built. Each numbered step ends with its tests passing.

**A. Measure and guard**

1. Record the app baseline (section 8) on 2.9.2.
2. Request log, slow-query log, health check, advisory lock on the pins scheduler.
3. Wake-up schedule to 5 minutes; owner sets up the uptime monitor.

**B. Database**

4. Migrations 025 to 029 and their trigger tests. Run each against a copy of production data locally first.
5. Name-key function with shared test names.

**C. Backend features**

6. Changes endpoint.
7. Mark bought, undo and price change: trips and products.
8. History endpoints and month totals.
9. Plans and limits.
10. Clean-up job and its daily workflow.
11. Storage layer, photo upload and download, migration 030, the copy endpoint. Built and tested with the `fs` driver; the R2 keys are only needed in Render at release.
11b. Icons for categories and shops: migration 031, the four endpoints, their tests (section 4.7).
12. Lab files for each new query in `docs/perf-lab/`; load test.

**D. App**

13. Sync engine; remove the full refresh and the two polls.
14. Products for suggestions and prices; month totals for summary, forecast and recap card.
15. History and Invoices screens.
15b. Icons for categories and shops: the icon component, the places it shows, the change sheet (section 5.4).
16. Photos.
17. Context split and start-up.
18. Measure again (section 8).
19. **Cut line.** SQLite tables. If step 19 is not stable in testing, 2.9.3 ships without it and it becomes 2.9.4.

**E. Release 2.9.3** (each step on the owner's request)

20. Deploy the backend through the Render API; confirm migrations ran and `/api/health` is healthy.
21. Owner adds the six storage variables in Render (section 12); deploy again; call the copy endpoint until none remain; check a photo in 2.9.2.
22. Bump the version to 2.9.3 (`versionCode` 51) and write "What's new".
23. Build the APK; test on a throwaway emulator and the Samsung Galaxy A52, with Animations on and off.
24. Point `APP_LATEST_VERSION` and `APP_DOWNLOAD_URL` at the new APK.

## 10. After the release

When no 2.9.2 requests appear in the request log for two weeks (or on the owner's decision): raise `APP_MIN_VERSION` to 2.9.3, remove `GET /homes/:homeId/items` and the per-screen reads the changes endpoint replaced, and run the `CleanUp` migration (3.8).

## 11. Deferred

| Item | Trigger |
| --- | --- |
| Move to Frankfurt (runbook in the decision log) | Owner's decision |
| Custom domain; then public photo addresses with CDN caching | Store release |
| Billing, paywall, `free` and `paid` plans, final limits | Store release |
| Paid API plan (never sleeps) | Store release |
| Server-sent events in place of polling | Paid API and measured polling load |
| Second API instance; shared rate limits; grouped notifications in a table; connection pooling | API processor above 60% sustained, or 95% of requests over 300 ms |
| Next database plan | Processor or disk above 70% |
| First iOS build and gap list (widgets, forced update, back button, blur) | Store release |
| Error and performance service (Sentry or similar) | Store release |

## 12. Owner tasks

None of these block the build until the step named.

| Task | Needed by | Steps |
| --- | --- | --- |
| Uptime monitor | Step 3 | Create a free account with an uptime monitor (for example UptimeRobot). Add one HTTP monitor for `https://one-more-thing-api.onrender.com/api/health`, every 5 minutes. Turn on email alerts. |
| R2 bucket | Step 21 | In the Cloudflare dashboard open **R2 Object Storage** and turn it on (Cloudflare may ask for a payment card even for the free tier). Create a bucket, for example `one-more-thing-photos`, with the location hint for Europe. Leave public access off. |
| R2 access keys | Step 21 | In R2, open **Manage API tokens** and create a token with **Object Read & Write**, limited to that one bucket. Cloudflare shows an Access Key ID, a Secret Access Key and an S3 endpoint (`https://<account id>.r2.cloudflarestorage.com`) once. Save them in a password manager. |
| Render variables | Step 21 | In Render open the service `one-more-thing-api`, then **Environment**, and add: `STORAGE_DRIVER` = `s3`, `S3_REGION` = `auto`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Do not send these values to anyone, including the assistant. |
| Close the database | After step 20 | In Render open the database, then **Networking** (access control), and remove the `0.0.0.0/0` entry, once the build thread has confirmed the API uses the internal address. |
| Test on the A52 | Steps 1, 18, 23 | Install the build and run the measurements with the build thread's instructions. |

The labels in Cloudflare and Render may differ slightly from the names above.
