-- Step 12 lesson: the daily clean-up job's probe for one home.
-- SQL copied from backend/src/modules/maintenance/maintenance.service.ts (cleanHome):
-- "which months of this home are older than its plan keeps?"
-- The job runs this for every home once a day, so for a home with nothing to
-- clean (almost all of them) it must cost only a few pages.
-- Run from the project root, after the migrations (README.md):
--   docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/s12-cleanup.sql
--
-- In each plan, read two lines:
--   "Buffers: shared hit=N read=M"  = pages touched (8 kB each)
--   "Execution Time"                = time inside Postgres

\set ON_ERROR_STOP on
select home_id as busy from lab_home where n = 2 \gset
select home_id as old from lab_home where n = 1 \gset

\echo
\echo ===== 1. Busy home, 12-month plan: nothing older than the cutoff (the usual case) =====
explain (analyze, buffers, costs off)
with bounds as (
  select coalesce(h.timezone, 'Asia/Amman') as tz,
         (date_trunc('month', now() at time zone coalesce(h.timezone, 'Asia/Amman')) - make_interval(months => 12))
           at time zone coalesce(h.timezone, 'Asia/Amman') as cutoff
    from homes h where h.id = :'busy'
),
old as (
  select distinct date_trunc('month', r.started_at at time zone b.tz) as local_month, b.tz
    from trip_receipts r, bounds b
   where r.home_id = :'busy' and r.started_at < b.cutoff
)
select to_char(local_month, 'YYYY-MM') as month,
       local_month at time zone tz as start,
       (local_month + interval '1 month') at time zone tz as "end"
  from old order by local_month;

\echo
\echo ===== 2. 3-year home: two years of months to clean =====
explain (analyze, buffers, costs off)
with bounds as (
  select coalesce(h.timezone, 'Asia/Amman') as tz,
         (date_trunc('month', now() at time zone coalesce(h.timezone, 'Asia/Amman')) - make_interval(months => 12))
           at time zone coalesce(h.timezone, 'Asia/Amman') as cutoff
    from homes h where h.id = :'old'
),
old as (
  select distinct date_trunc('month', r.started_at at time zone b.tz) as local_month, b.tz
    from trip_receipts r, bounds b
   where r.home_id = :'old' and r.started_at < b.cutoff
)
select to_char(local_month, 'YYYY-MM') as month,
       local_month at time zone tz as start,
       (local_month + interval '1 month') at time zone tz as "end"
  from old order by local_month;

\echo
\echo ===== 3. 3-year home: one old month's purchases, the delete batch's select (run read-only here) =====
select (date_trunc('month', now() at time zone 'Asia/Amman') - interval '24 months') at time zone 'Asia/Amman' as m_start,
       (date_trunc('month', now() at time zone 'Asia/Amman') - interval '23 months') at time zone 'Asia/Amman' as m_end \gset
explain (analyze, buffers, costs off)
select i.id from items i join trip_receipts r on r.id = i.receipt_id
 where r.home_id = :'old' and r.started_at >= :'m_start' and r.started_at < :'m_end'
 limit 1000;
