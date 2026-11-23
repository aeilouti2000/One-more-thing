-- D3 lesson: one History page, without and with its index.
-- Run from the project root:
--   docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/d3-history.sql
-- In each plan, read two lines:
--   "Buffers: shared hit=N"  = how many 8 kB pages Postgres had to read
--   "Execution Time"         = how long the query took

select home_id as h from lab_home where n = 2 \gset

\echo
\echo ===== 1. WITHOUT the history index =====
drop index if exists items_home_bought_idx;
explain (analyze, buffers, costs off)
select * from items
where home_id = :'h' and status = 'bought'
order by bought_at desc, id desc
limit 30;

\echo
\echo ===== 2. WITH the history index =====
create index items_home_bought_idx
  on items (home_id, bought_at desc, id desc)
  where status = 'bought';
explain (analyze, buffers, costs off)
select * from items
where home_id = :'h' and status = 'bought'
order by bought_at desc, id desc
limit 30;
