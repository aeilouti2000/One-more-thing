-- Fills the omt_perf test database with fake data at the size of a large app.
-- 30,000 homes: 6,000 active (720 purchases over 12 months, 30 needed items)
-- and 24,000 quiet (20 old purchases, 5 needed items). About 5 million items.
-- Home number 1 also gets two more years of history (no retention).
-- Run: docker exec -i backend-db-1 psql -U omt -d omt_perf < seed.sql

\timing on
set session_replication_role = replica;  -- skip foreign-key checks while loading

truncate items, lists, home_members, homes, users cascade;

create temp table seed_home as
select n,
       gen_random_uuid() as home_id,
       gen_random_uuid() as user_id,
       gen_random_uuid() as list_id
from generate_series(1, 30000) n;

insert into users (id, email, name)
select user_id, 'user' || n || '@example.test', 'User ' || n from seed_home;

insert into homes (id, name, invite_code)
select home_id, 'Home ' || n, 'INV' || n from seed_home;

insert into home_members (home_id, user_id, role)
select home_id, user_id, 'owner' from seed_home;

insert into lists (id, home_id, name)
select list_id, home_id, 'Weekly' from seed_home;

create temp table seed_name as
select row_number() over () as k, base || suffix as name, category
from (values
  ('Tomatoes','vegetables'),('Cucumber','vegetables'),('Onions','vegetables'),('Potatoes','vegetables'),
  ('Lettuce','vegetables'),('Parsley','vegetables'),('Lemons','vegetables'),('Garlic','vegetables'),
  ('Chicken breast','meat'),('Minced beef','meat'),('Lamb','meat'),('Fish fillet','meat'),
  ('Milk','supermarket'),('Bread','supermarket'),('Eggs','supermarket'),('Rice','supermarket'),
  ('Sugar','supermarket'),('Olive oil','supermarket'),('Yogurt','supermarket'),('Cheese','supermarket'),
  ('Dish soap','supermarket'),('Tissues','supermarket'),('Tomato paste','supermarket'),('Hummus','supermarket'),
  ('Panadol','pharmacy'),('Vitamin C','pharmacy'),('Coffee beans','coffee'),('Turkish coffee','coffee'),
  ('Tea','coffee'),('Water bottles','other')
) b(base, category),
(values (''),(' large'),(' small'),(' organic'),(' 2 pack'),(' family')) s(suffix);
-- 180 different names

-- Purchases, written in time order so homes are mixed together on disk, as in real life.
insert into items (home_id, list_id, name, quantity, unit, category, status, added_by, bought_by,
                   created_at, bought_at, cost)
select h.home_id, h.list_id, nm.name, 1 + (random() * 3)::int, null, nm.category, 'bought',
       h.user_id, h.user_id, t.at - interval '1 day', t.at, round((random() * 20)::numeric, 3)
from seed_home h
cross join lateral (
  select now() - (random() * case when h.n = 1 then 1095 else 365 end) * interval '1 day' as at,
         1 + floor(random() * 180)::int as k
  from generate_series(1, case when h.n = 1 then 2160 when h.n <= 6000 then 720 else 20 end)
) t
join seed_name nm on nm.k = t.k
order by t.at;

-- Needed items (the shopping list itself).
insert into items (home_id, list_id, name, quantity, category, status, added_by, created_at, sort_order)
select h.home_id, h.list_id, nm.name, 1, nm.category, 'needed', h.user_id,
       now() - random() * interval '14 days', g
from seed_home h
cross join lateral generate_series(1, case when h.n <= 6000 then 30 else 5 end) g
join seed_name nm on nm.k = 1 + ((h.n + g * 7) % 180);

set session_replication_role = origin;
vacuum analyze;

-- The homes the test queries use.
drop table if exists lab_home;
create table lab_home as select n, home_id, list_id, user_id from seed_home where n in (1, 2, 20000);

select count(*) as items, pg_size_pretty(pg_total_relation_size('items')) as size_with_indexes from items;
