-- Step 12 lesson: the index step 12 added (migration 032), without and with it.
-- Run from the project root, after the migrations (README.md):
--   docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/s12-trip-index.sql
-- The file drops the index, measures, and builds it again, so it ends as it started.
--
-- In each plan, read two lines:
--   "Buffers: shared hit=N read=M"  = pages touched (8 kB each)
--   "Execution Time"                = time inside Postgres
--
-- What to look for: without the index, Postgres finds the home's trips through
-- trip_receipts_home_started_idx, which is sorted by START time. Both queries
-- ask about the LAST purchase time, so it has to fetch every trip the home ever
-- had ("Rows Removed by Filter: 649") and keep the few that match. With an
-- index sorted by last purchase time it jumps straight to the recent trips.

\set ON_ERROR_STOP on
select home_id as busy, list_id as busy_list from lab_home where n = 2 \gset
select home_id as old, list_id as old_list from lab_home where n = 1 \gset
select (date_trunc('month', now() at time zone 'Asia/Amman') - interval '1 month') at time zone 'Asia/Amman' as w \gset
-- "What changed in the last 10 changes" of the busy home.
select greatest(version - 10, 0) as since from homes where id = :'busy' \gset

drop index if exists trip_receipts_home_last_idx;

\echo
\echo ===== 1. WITHOUT the index: open trip of a list, on every purchase (TripsService.attachNewPurchases) =====
explain (analyze, buffers, costs off)
select id from trip_receipts
 where home_id = :'busy' and list_id = :'busy_list'
   and last_bought_at >= now() - interval '90 minutes' and started_at <= now() + interval '90 minutes'
 order by last_bought_at desc
 limit 1;

\echo
\echo ===== 2. WITHOUT the index: trips of the window changed since N (SyncRepository.trips) =====
explain (analyze, buffers, costs off)
select id, list_id, name, total, started_at, last_bought_at
  from trip_receipts
 where home_id = :'busy' and last_bought_at >= :'w' and (:since::bigint is null or version > :since);

\echo
\echo ===== building the index (migration 032) =====
\timing on
create index trip_receipts_home_last_idx on trip_receipts (home_id, last_bought_at desc);
\timing off

\echo
\echo ===== 3. WITH the index: open trip of a list =====
explain (analyze, buffers, costs off)
select id from trip_receipts
 where home_id = :'busy' and list_id = :'busy_list'
   and last_bought_at >= now() - interval '90 minutes' and started_at <= now() + interval '90 minutes'
 order by last_bought_at desc
 limit 1;

\echo
\echo ===== 4. WITH the index: trips of the window changed since N =====
explain (analyze, buffers, costs off)
select id, list_id, name, total, started_at, last_bought_at
  from trip_receipts
 where home_id = :'busy' and last_bought_at >= :'w' and (:since::bigint is null or version > :since);

select pg_size_pretty(pg_relation_size('trip_receipts_home_last_idx')) as index_size,
       pg_size_pretty(pg_relation_size('trip_receipts')) as table_size;
