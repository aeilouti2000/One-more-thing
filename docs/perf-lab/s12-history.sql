-- Step 12 lesson: the History endpoints.
-- SQL copied from backend/src/modules/history/history.repository.ts
-- (TypeORM's column list is shortened to "item.*"; the filters, joins and order are the real ones).
-- Run from the project root, after the migrations (README.md):
--   docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/s12-history.sql
--
-- In each plan, read two lines:
--   "Buffers: shared hit=N read=M"  = pages touched (8 kB each)
--   "Execution Time"                = time inside Postgres
-- and compare the pages with the rows the top line returns.
--
-- Rule the queries follow: a purchase belongs to the month its TRIP started, so
-- the purchases page joins trip_receipts and looks for items 2 days either side
-- of the month (a trip can run past midnight).

\set ON_ERROR_STOP on
select home_id as busy, list_id as busy_list from lab_home where n = 2 \gset
select home_id as old from lab_home where n = 1 \gset

-- Last month (a full month) and the plan cutoff (12 months), in the home's time zone:
-- HistoryRepository.bounds.
select make_timestamp(extract(year from m)::int, extract(month from m)::int, 1, 0, 0, 0)
         at time zone coalesce(h.timezone, 'Asia/Amman') as start,
       (make_timestamp(extract(year from m)::int, extract(month from m)::int, 1, 0, 0, 0) + interval '1 month')
         at time zone coalesce(h.timezone, 'Asia/Amman') as end,
       (date_trunc('month', now() at time zone coalesce(h.timezone, 'Asia/Amman')) - make_interval(months => 12))
         at time zone coalesce(h.timezone, 'Asia/Amman') as cutoff
  from homes h, (select date_trunc('month', now()) - interval '1 month' as m) x
 where h.id = :'busy' \gset

\echo
\echo ===== 1. Purchases, page 1 of last month (HistoryRepository.purchases, limit 30 + 1) =====
explain (analyze, buffers, costs off)
select item.* from items item
 inner join trip_receipts trip on trip.id = item.receipt_id
 where item.home_id = :'busy' and item.status = 'bought'
   and item.bought_at >= cast(:'start' as timestamptz) - interval '2 days'
   and item.bought_at < cast(:'end' as timestamptz) + interval '2 days'
   and trip.started_at >= :'start' and trip.started_at < :'end'
   and trip.started_at >= :'cutoff'
 order by item.bought_at desc, item.id desc
 limit 31;

-- The cursor the API returns for page 2: the 30th row's bought_at and id.
select item.bought_at as cursor_at, item.id as cursor_id from items item
 inner join trip_receipts trip on trip.id = item.receipt_id
 where item.home_id = :'busy' and item.status = 'bought'
   and item.bought_at >= cast(:'start' as timestamptz) - interval '2 days'
   and item.bought_at < cast(:'end' as timestamptz) + interval '2 days'
   and trip.started_at >= :'start' and trip.started_at < :'end'
 order by item.bought_at desc, item.id desc
 offset 29 limit 1 \gset

\echo
\echo ===== 2. Purchases, page 2 by cursor =====
explain (analyze, buffers, costs off)
select item.* from items item
 inner join trip_receipts trip on trip.id = item.receipt_id
 where item.home_id = :'busy' and item.status = 'bought'
   and item.bought_at >= cast(:'start' as timestamptz) - interval '2 days'
   and item.bought_at < cast(:'end' as timestamptz) + interval '2 days'
   and trip.started_at >= :'start' and trip.started_at < :'end'
   and trip.started_at >= :'cutoff'
   and (item.bought_at, item.id) < (cast(:'cursor_at' as timestamptz), cast(:'cursor_id' as uuid))
 order by item.bought_at desc, item.id desc
 limit 31;

\echo
\echo ===== 3. Purchases filtered by category (same query + category) =====
explain (analyze, buffers, costs off)
select item.* from items item
 inner join trip_receipts trip on trip.id = item.receipt_id
 where item.home_id = :'busy' and item.status = 'bought'
   and item.bought_at >= cast(:'start' as timestamptz) - interval '2 days'
   and item.bought_at < cast(:'end' as timestamptz) + interval '2 days'
   and trip.started_at >= :'start' and trip.started_at < :'end'
   and trip.started_at >= :'cutoff'
   and item.category = 'meat'
 order by item.bought_at desc, item.id desc
 limit 31;

\echo
\echo ===== 4a. Search "tom" in every kept month, busy home (HistoryRepository.search) =====
explain (analyze, buffers, costs off)
select item.* from items item
 where item.home_id = :'busy' and item.status = 'bought'
   and item.bought_at >= :'cutoff'
   and item.name ilike '%tom%'
 order by item.bought_at desc, item.id desc
 limit 31;

\echo
\echo ===== 4b. Search a name nobody bought (worst case: reads every kept purchase) =====
explain (analyze, buffers, costs off)
select item.* from items item
 where item.home_id = :'busy' and item.status = 'bought'
   and item.bought_at >= :'cutoff'
   and item.name ilike '%zzz%'
 order by item.bought_at desc, item.id desc
 limit 31;

\echo
\echo ===== 4c. Same worst case, 3-year home (the plan cutoff keeps it to 12 months) =====
explain (analyze, buffers, costs off)
select item.* from items item
 where item.home_id = :'old' and item.status = 'bought'
   and item.bought_at >= :'cutoff'
   and item.name ilike '%zzz%'
 order by item.bought_at desc, item.id desc
 limit 31;

\echo
\echo ===== 5. Trips page of last month, with counts and a 3-item preview (HistoryRepository.trips, limit 20 + 1) =====
explain (analyze, buffers, costs off)
select r.id, r.name, r.list_id, l.name as list_name, r.total, r.started_at, r.last_bought_at,
       counts.item_count, counts.priced_count, counts.items_total, preview.items as preview
  from trip_receipts r
  left join lists l on l.id = r.list_id
  cross join lateral (
    select count(*) as item_count, count(i.cost) as priced_count, coalesce(sum(i.cost), 0) as items_total
      from items i where i.receipt_id = r.id and i.status = 'bought'
  ) counts
  cross join lateral (
    select coalesce(json_agg(json_build_object('name', p.name, 'category', p.category, 'imageId', p.image_id)), '[]') as items
      from (select i.name, i.category, i.image_id from items i
             where i.receipt_id = r.id and i.status = 'bought'
             order by i.bought_at, i.id limit 3) p
  ) preview
 where r.home_id = :'busy' and r.started_at >= :'start' and r.started_at < :'end' and r.started_at >= :'cutoff'
   and (null::uuid is null or r.list_id = null)
   and (null::timestamptz is null or (r.started_at, r.id) < (null, null::uuid))
   and counts.item_count > 0
 order by r.started_at desc, r.id desc
 limit 21;

\echo
\echo ===== 6. Month totals: last month's rows by trip and category (HistoryRepository.monthRows) =====
explain (analyze, buffers, costs off)
select r.id as trip_id, r.total, i.category,
       count(*) as items, count(i.cost) as priced, coalesce(sum(i.cost), 0) as cost_sum
  from trip_receipts r
  join items i on i.receipt_id = r.id and i.status = 'bought'
 where r.home_id = :'busy' and r.started_at >= :'start' and r.started_at < :'end'
 group by r.id, i.category;

\echo
\echo ===== 7a. Months list: every trip with its month and totals, busy home (HistoryRepository.tripsByMonth, called with since = null) =====
explain (analyze, buffers, costs off)
select to_char(r.started_at at time zone coalesce(h.timezone, 'Asia/Amman'), 'YYYY-MM') as month, r.total,
       count(i.id) as items, coalesce(sum(i.cost), 0) as items_total
  from trip_receipts r
  join homes h on h.id = r.home_id
  join items i on i.receipt_id = r.id and i.status = 'bought'
 where r.home_id = :'busy' and (null::timestamptz is null or r.started_at >= null)
 group by r.id, h.timezone;

\echo
\echo ===== 7b. Same, 3-year home (until the clean-up job runs, this is three years of purchases) =====
explain (analyze, buffers, costs off)
select to_char(r.started_at at time zone coalesce(h.timezone, 'Asia/Amman'), 'YYYY-MM') as month, r.total,
       count(i.id) as items, coalesce(sum(i.cost), 0) as items_total
  from trip_receipts r
  join homes h on h.id = r.home_id
  join items i on i.receipt_id = r.id and i.status = 'bought'
 where r.home_id = :'old' and (null::timestamptz is null or r.started_at >= null)
 group by r.id, h.timezone;
