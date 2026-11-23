-- Step 12 lesson: the changes endpoint (GET /api/homes/:homeId/changes?since=N).
-- SQL copied from backend/src/modules/sync/sync.repository.ts (and, for the first
-- block, from the auth, membership and shop-lock code every request runs first).
-- Run from the project root, after the migrations (README.md):
--   docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/s12-changes.sql
--
-- In each plan, read two lines:
--   "Buffers: shared hit=N read=M"  = pages Postgres touched (hit: already in memory,
--                                     read: fetched from disk). One page is 8 kB.
--   "Execution Time"                = how long the query took inside Postgres.
-- Compare the pages with the "rows=" on the top line: a good query touches a few
-- pages per row it returns. Many pages for few rows means it is reading rows it
-- then throws away (a missing or wrong index).
--
-- Two homes: the busy home (lab_home n=2: 720 purchases a year, 30 needed items)
-- and the 3-year home (n=1: 2,160 purchases over three years).

\set ON_ERROR_STOP on
select home_id as busy, list_id as busy_list, user_id as busy_user from lab_home where n = 2 \gset
select home_id as old, list_id as old_list from lab_home where n = 1 \gset

-- ---------------------------------------------------------------------------
-- Setup, once: after the seed every version is 0, which would make
-- "changed since N" look free. Give both homes a realistic counter and a few
-- dozen real changes, through the triggers, the way the app makes them:
--   40 items edited (needed ones and purchases inside the phone's window),
--    5 products bought again, 3 trips given a total, 5 needed items deleted.
-- The "since" used below is the version before the last 20 item edits, so the
-- answer has about 20 items, as when a phone was away for a few minutes.
-- ---------------------------------------------------------------------------
select not exists (select 1 from pg_tables where tablename = 'lab_since') as need_setup \gset
\if :need_setup
\echo ===== setup: stamping a few dozen changes in both homes =====
create table lab_since (n int primary key, since bigint not null);
do $$
declare r record; v1 bigint;
begin
  for r in select n, home_id from lab_home where n in (1, 2) loop
    update homes set version = 500000 where id = r.home_id;          -- a home that has seen some use
    update items set notes = 'edited ' || g.k
      from (select id, row_number() over (order by id) as k from items
             where home_id = r.home_id
               and (status = 'needed' or bought_at > now() - interval '20 days')
             order by id limit 20) g
     where items.id = g.id;
    select version into v1 from homes where id = r.home_id;
    update items set notes = 'edited again ' || g.k
      from (select id, row_number() over (order by id desc) as k from items
             where home_id = r.home_id
               and (status = 'needed' or bought_at > now() - interval '20 days')
             order by id desc limit 20) g
     where items.id = g.id;
    update home_products set times_bought = times_bought + 1
     where id in (select id from home_products where home_id = r.home_id order by id limit 5);
    update trip_receipts set total = 25
     where id in (select id from trip_receipts where home_id = r.home_id
                   order by started_at desc limit 3);
    delete from items
     where id in (select id from items where home_id = r.home_id and status = 'needed'
                   order by id limit 5);
    insert into lab_since values (r.n, v1);
  end loop;
end $$;
analyze items; analyze home_products; analyze trip_receipts; analyze home_deletions; analyze homes;
\endif

select since as busy_since from lab_since where n = 2 \gset
select since as old_since from lab_since where n = 1 \gset
-- The phone's window: purchases from the first day of last month (home's time zone).
select (date_trunc('month', now() at time zone coalesce(h.timezone, 'Asia/Amman')) - interval '1 month')
         at time zone coalesce(h.timezone, 'Asia/Amman') as busy_window
  from homes h where h.id = :'busy' \gset

\echo
\echo ===== 0. Every request starts with these: the user (JWT check), membership, expired shop locks =====
explain (analyze, buffers, costs off)
select * from users where id = :'busy_user' limit 1;
explain (analyze, buffers, costs off)
select * from home_members where home_id = :'busy' and user_id = :'busy_user' limit 1;
begin;
explain (analyze, buffers, costs off)
delete from list_shop_locks where home_id = :'busy' and heartbeat_at < now() - interval '2 minutes';
rollback;

\echo
\echo ===== 1. "Nothing changed": the home row (SyncRepository.state) =====
explain (analyze, buffers, costs off)
select h.version, h.sync_floor, h.timezone,
       (date_trunc('month', now() at time zone coalesce(h.timezone, 'Asia/Amman')) - interval '1 month')
         at time zone coalesce(h.timezone, 'Asia/Amman') as window_start
  from homes h where h.id = :'busy';

\echo
\echo ===== 2a. Items changed since N, busy home (about 20 rows) (SyncRepository.changedItems) =====
explain (analyze, buffers, costs off)
select * from items item
 where item.home_id = :'busy' and item.version > :busy_since
   and (item.status = 'needed' or item.bought_at >= :'busy_window');

\echo
\echo ===== 2b. Items changed since N, 3-year home =====
explain (analyze, buffers, costs off)
select * from items item
 where item.home_id = :'old' and item.version > :old_since
   and (item.status = 'needed' or item.bought_at >= :'busy_window');

\echo
\echo ===== 2c. Items of trips that changed (second half of changedItems: 3 trips) =====
select array_agg(id) as busy_trips from trip_receipts
 where home_id = :'busy' and last_bought_at >= :'busy_window' and version > :busy_since \gset
explain (analyze, buffers, costs off)
select * from items item
 where item.home_id = :'busy' and item.receipt_id = any(:'busy_trips'::uuid[])
   and (item.status = 'needed' or item.bought_at >= :'busy_window');

\echo
\echo ===== 3. Products changed since N (SyncRepository.products) =====
explain (analyze, buffers, costs off)
select id, name, name_key, category, unit, last_cost, last_cost_qty, last_cost_unit,
       last_cost_at, last_bought_at, times_bought
  from home_products
 where home_id = :'busy' and (:busy_since::bigint is null or version > :busy_since);

\echo
\echo ===== 4a. Trips in the window changed since N (SyncRepository.trips) =====
explain (analyze, buffers, costs off)
select id, list_id, name, total, started_at, last_bought_at
  from trip_receipts
 where home_id = :'busy' and last_bought_at >= :'busy_window'
   and (:busy_since::bigint is null or version > :busy_since);

\echo
\echo ===== 4b. Same, 3-year home (more trips to look through) =====
explain (analyze, buffers, costs off)
select id, list_id, name, total, started_at, last_bought_at
  from trip_receipts
 where home_id = :'old' and last_bought_at >= :'busy_window'
   and (:old_since::bigint is null or version > :old_since);

\echo
\echo ===== 5. Deletion markers since N (SyncRepository.deletions) =====
explain (analyze, buffers, costs off)
select entity, entity_id from home_deletions
 where home_id = :'busy' and version > :busy_since and entity in ('item', 'product', 'trip')
 order by version;

\echo
\echo ===== 6. Full copy, for comparison (first open: SyncRepository.allItems, trips and products with since = null) =====
explain (analyze, buffers, costs off)
select * from items item
 where item.home_id = :'busy'
   and (item.status = 'needed' or (item.status = 'bought' and item.bought_at >= :'busy_window'))
 order by item.sort_order asc, item.created_at desc;
explain (analyze, buffers, costs off)
select id, list_id, name, total, started_at, last_bought_at
  from trip_receipts
 where home_id = :'busy' and last_bought_at >= :'busy_window' and (null::bigint is null or version > null);
explain (analyze, buffers, costs off)
select id, name, name_key, category, unit, last_cost, last_cost_qty, last_cost_unit,
       last_cost_at, last_bought_at, times_bought
  from home_products where home_id = :'busy' and (null::bigint is null or version > null);
