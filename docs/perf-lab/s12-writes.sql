-- Step 12 lesson: what a purchase writes besides the item itself.
-- SQL copied from backend/src/modules/items/services/trips.service.ts (trip attach)
-- and products.service.ts (product upsert, product refresh on undo or price change).
-- Run from the project root, after the migrations (README.md):
--   docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/s12-writes.sql
-- Writes run inside begin ... rollback, so the lab data does not change.
--
-- In each plan, read two lines:
--   "Buffers: shared hit=N read=M dirtied=D"  = pages touched (dirtied: changed in memory)
--   "Execution Time"                          = time inside Postgres, triggers included
--                                               ("Trigger ...: time=" lines show them)

\set ON_ERROR_STOP on
select home_id as busy, list_id as busy_list from lab_home where n = 2 \gset
select home_id as old, list_id as old_list from lab_home where n = 1 \gset

-- Warm-up, not measured: the first time a connection fires a trigger, Postgres
-- compiles the trigger function and plans its queries, reading a few hundred
-- catalog pages (measured: 566 pages and 7 ms, then 38 pages and 1 ms).
-- The API keeps its connections open, so only the warm numbers matter.
begin;
update trip_receipts set total = coalesce(total, 0) + 1 where id = (select id from trip_receipts where home_id = :'busy' limit 1);
update home_products set times_bought = times_bought + 1 where id = (select id from home_products where home_id = :'busy' limit 1);
update items set notes = 'warm' where id = (select id from items where home_id = :'busy' limit 1);
rollback;

\echo
\echo ===== 1a. Trip attach: the open trip of this list, bought within 90 minutes (TripsService.attachNewPurchases), busy home =====
-- Mark bought at "now": a trip whose last purchase is at most 90 minutes old,
-- and that started no later than 90 minutes from now.
explain (analyze, buffers, costs off)
select id from trip_receipts
 where home_id = :'busy' and list_id = :'busy_list'
   and last_bought_at >= now() - interval '90 minutes' and started_at <= now() + interval '90 minutes'
 order by last_bought_at desc
 limit 1;

\echo
\echo ===== 1b. Same, 3-year home =====
explain (analyze, buffers, costs off)
select id from trip_receipts
 where home_id = :'old' and list_id = :'old_list'
   and last_bought_at >= now() - interval '90 minutes' and started_at <= now() + interval '90 minutes'
 order by last_bought_at desc
 limit 1;

\echo
\echo ===== 2. Trip times from its items (TripsService.refreshTimes, one trip) =====
select id as trip from trip_receipts where home_id = :'busy' order by started_at desc limit 1 \gset
-- The lab trip's times are already right, so "- interval '1 second'" (not in the
-- app's SQL) makes the row count as changed and the update really happen, as it
-- does after a new purchase joins the trip.
begin;
explain (analyze, buffers, costs off)
update trip_receipts r
   set started_at = x.first_at, last_bought_at = x.last_at
  from (select receipt_id, min(bought_at) as first_at, max(bought_at) as last_at
          from items
         where receipt_id = any(array[:'trip']::uuid[]) and bought_at is not null
         group by receipt_id) x
 where r.id = x.receipt_id
   and (r.started_at, r.last_bought_at) is distinct from (x.first_at - interval '1 second', x.last_at);
rollback;

\echo
\echo ===== 3. Product upsert: one purchase of a name the home already has (ProductsService.recordPurchases) =====
select name_key as key, name as pname, category as pcat from home_products where home_id = :'busy' limit 1 \gset
begin;
explain (analyze, buffers, costs off)
insert into home_products as p
  (home_id, name_key, name, category, unit, last_cost, last_cost_qty, last_cost_unit,
   last_cost_at, last_bought_at, times_bought)
values (:'busy', :'key', :'pname', :'pcat', null, 2.5::numeric, 1::numeric, null, now()::timestamptz, now()::timestamptz, 1::int)
on conflict (home_id, name_key) do update set
  name           = excluded.name,
  category       = excluded.category,
  unit           = excluded.unit,
  last_bought_at = greatest(p.last_bought_at, excluded.last_bought_at),
  times_bought   = p.times_bought + excluded.times_bought,
  last_cost      = coalesce(excluded.last_cost, p.last_cost),
  last_cost_qty  = case when excluded.last_cost is null then p.last_cost_qty else excluded.last_cost_qty end,
  last_cost_unit = case when excluded.last_cost is null then p.last_cost_unit else excluded.last_cost_unit end,
  last_cost_at   = coalesce(excluded.last_cost_at, p.last_cost_at);
rollback;

\echo
\echo ===== 4a. Product refresh after an undo or a price change (ProductsService.refresh), busy home =====
-- Finds the newest purchase, and the newest priced purchase, of one name.
begin;
explain (analyze, buffers, costs off)
update home_products p set
    last_bought_at = coalesce(newest.at, p.last_bought_at),
    name           = coalesce(newest.name, p.name),
    category       = coalesce(newest.category, p.category),
    unit           = case when newest.at is null then p.unit else newest.unit end,
    last_cost      = priced.cost,
    last_cost_qty  = priced.quantity,
    last_cost_unit = priced.unit,
    last_cost_at   = priced.at
  from (select 1) one
  left join lateral (
    select btrim(i.name) as name, i.category, i.unit, coalesce(i.bought_at, i.created_at) as at
      from items i
     where i.home_id = :'busy' and i.status = 'bought'
       and regexp_replace(regexp_replace(lower(btrim(i.name)), '[ً-ْـ]', '', 'g'), '\s+', ' ', 'g') = :'key'
     order by coalesce(i.bought_at, i.created_at) desc, i.id desc
     limit 1
  ) newest on true
  left join lateral (
    select i.cost, i.quantity, i.unit, coalesce(i.bought_at, i.created_at) as at
      from items i
     where i.home_id = :'busy' and i.status = 'bought' and i.cost is not null
       and regexp_replace(regexp_replace(lower(btrim(i.name)), '[ً-ْـ]', '', 'g'), '\s+', ' ', 'g') = :'key'
     order by coalesce(i.bought_at, i.created_at) desc, i.id desc
     limit 1
  ) priced on true
 where p.home_id = :'busy' and p.name_key = :'key';
rollback;
