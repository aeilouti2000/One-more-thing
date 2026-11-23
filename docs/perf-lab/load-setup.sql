-- Step 12 load test: picks the lab homes the virtual phones use, and gives the
-- "marking bought" homes enough needed items for a few minutes of buying.
-- Run once before load-test.mjs (safe to run again):
--   docker exec -i backend-db-1 psql -U omt -d omt_perf < docs/perf-lab/load-setup.sql
--
-- Every phone is a different lab user (the owner of one lab home), because the
-- API limits each user to 120 requests a minute. All homes used are "active"
-- homes (n <= 6000: 720 purchases over 12 months, 30 needed items).
--
--   changes  homes n = 3 .. 202   200 phones asking "what changed" every 3 s
--   history  homes n = 203 .. 252  50 phones paging History
--   bought   homes n = 253 .. 302  50 phones marking items bought

drop table if exists lab_load;
create table lab_load as
select case when h.n between 3 and 202 then 'changes'
            when h.n between 203 and 252 then 'history'
            else 'bought' end as scenario,
       h.n, h.id as home_id, m.user_id, u.email
  from (select id, substring(name from 6)::int as n from homes where name ~ '^Home [0-9]+$') h  -- seed names homes "Home <n>"
  join home_members m on m.home_id = h.id and m.role = 'owner'
  join users u on u.id = m.user_id
 where h.n between 3 and 302;

-- 200 more needed items in each "bought" home (the load test buys about one a second per phone).
-- Inserting them stamps versions through the triggers, as the app's own inserts do.
insert into items (home_id, list_id, name, quantity, category, status, added_by, created_at, sort_order)
select l.home_id, li.id, 'Load item ' || g, 1, 'supermarket', 'needed', l.user_id, now(), 1000 + g
  from lab_load l
  join lists li on li.home_id = l.home_id
 cross join generate_series(1, 200) g
 where l.scenario = 'bought'
   and (select count(*) from items i where i.home_id = l.home_id and i.status = 'needed') < 150;

analyze items;

select scenario, count(*) as phones from lab_load group by scenario order by scenario;
