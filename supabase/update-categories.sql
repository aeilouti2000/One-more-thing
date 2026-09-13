-- Run once in the Supabase SQL Editor for an existing installation.
alter table public.items drop constraint if exists items_category_check;

update public.items
set category = case category
  when 'market' then 'supermarket'
  when 'household' then 'other'
  when 'personal' then 'other'
  else category
end
where category in ('market', 'household', 'personal');

alter table public.items
  add constraint items_category_check
  check (
    category in ('vegetables', 'meat', 'supermarket', 'pharmacy', 'coffee', 'other')
  );
