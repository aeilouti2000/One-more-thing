-- One More Thing — run this WHOLE file once in Supabase → SQL Editor → Run.
-- Safe to run again. This is the only SQL file you need.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.home_members (
  home_id uuid not null references public.homes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'partner')),
  created_at timestamptz not null default now(),
  primary key (home_id, user_id)
);

create unique index if not exists home_members_one_home_per_user
  on public.home_members (user_id);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes (id) on delete cascade,
  name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit text,
  category text not null check (
    category in ('vegetables', 'meat', 'supermarket', 'pharmacy', 'coffee', 'other')
  ),
  notes text,
  status text not null default 'needed' check (status in ('needed', 'bought')),
  added_by uuid not null references auth.users (id),
  bought_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  bought_at timestamptz
);

create index if not exists items_home_status_idx
  on public.items (home_id, status);

alter table public.home_members drop constraint if exists home_members_user_id_fkey;
alter table public.home_members
  add constraint home_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.items drop constraint if exists items_added_by_fkey;
alter table public.items
  add constraint items_added_by_fkey
  foreign key (added_by) references auth.users (id);

alter table public.items drop constraint if exists items_bought_by_fkey;
alter table public.items
  add constraint items_bought_by_fkey
  foreign key (bought_by) references auth.users (id);

alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.home_members enable row level security;
alter table public.items enable row level security;

-- Migrate the original category set when this script is rerun on an existing app.
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

create or replace function public.is_home_member(p_home_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.home_members
    where home_id = p_home_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    code := 'OMT-' || upper(encode(gen_random_bytes(4), 'hex'));
    exit when not exists (select 1 from public.homes where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'Member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into public.profiles (id, name)
  values (
    auth.uid(),
    coalesce(
      nullif(
        (
          select raw_user_meta_data ->> 'name'
          from auth.users
          where id = auth.uid()
        ),
        ''
      ),
      'Member'
    )
  )
  on conflict (id) do update
    set name = excluded.name
  returning * into result;

  return result;
end;
$$;

create or replace function public.create_home(p_name text)
returns public.homes
language plpgsql
security definer
set search_path = public
as $$
declare
  new_home public.homes;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  perform public.ensure_profile();

  if exists (select 1 from public.home_members where user_id = auth.uid()) then
    raise exception 'You already belong to a home';
  end if;

  insert into public.homes (name, invite_code)
  values (trim(p_name), public.generate_invite_code())
  returning * into new_home;

  insert into public.home_members (home_id, user_id, role)
  values (new_home.id, auth.uid(), 'owner');

  return new_home;
end;
$$;

create or replace function public.join_home(p_code text)
returns public.homes
language plpgsql
security definer
set search_path = public
as $$
declare
  found_home public.homes;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  perform public.ensure_profile();

  if exists (select 1 from public.home_members where user_id = auth.uid()) then
    raise exception 'You already belong to a home';
  end if;

  select * into found_home
  from public.homes
  where invite_code = upper(trim(p_code));

  if found_home.id is null then
    raise exception 'Unknown invite code';
  end if;

  insert into public.home_members (home_id, user_id, role)
  values (found_home.id, auth.uid(), 'partner');

  return found_home;
end;
$$;

create or replace function public.get_my_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'invite_code', h.invite_code,
    'created_at', h.created_at,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.user_id,
          'role', m.role,
          'name', coalesce(p.name, 'Member')
        )
      )
      from public.home_members m
      left join public.profiles p on p.id = m.user_id
      where m.home_id = h.id
    ), '[]'::jsonb)
  )
  into result
  from public.home_members mine
  join public.homes h on h.id = mine.home_id
  where mine.user_id = auth.uid()
  limit 1;

  return result;
end;
$$;

create or replace function public.list_home_items()
returns setof public.items
language sql
stable
security definer
set search_path = public
as $$
  select i.*
  from public.items i
  join public.home_members m on m.home_id = i.home_id
  where m.user_id = auth.uid()
  order by i.created_at desc;
$$;

create or replace function public.add_item(
  p_home_id uuid,
  p_name text,
  p_quantity numeric,
  p_category text,
  p_notes text default null,
  p_unit text default null
)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  new_item public.items;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  perform public.ensure_profile();

  if not public.is_home_member(p_home_id) then
    raise exception 'You do not belong to this home';
  end if;

  insert into public.items (
    home_id, name, quantity, unit, category, notes, status, added_by
  )
  values (
    p_home_id,
    trim(p_name),
    p_quantity,
    nullif(trim(coalesce(p_unit, '')), ''),
    p_category,
    nullif(trim(coalesce(p_notes, '')), ''),
    'needed',
    auth.uid()
  )
  returning * into new_item;

  return new_item;
end;
$$;

create or replace function public.mark_item_bought(p_item_id uuid)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.items;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  update public.items
  set
    status = 'bought',
    bought_by = auth.uid(),
    bought_at = now()
  where id = p_item_id
    and public.is_home_member(home_id)
  returning * into updated;

  if updated.id is null then
    raise exception 'Item not found';
  end if;

  return updated;
end;
$$;

create or replace function public.update_home_name(
  p_home_id uuid,
  p_name text
)
returns public.homes
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.homes;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Family name is required';
  end if;

  update public.homes
  set name = trim(p_name)
  where id = p_home_id
    and public.is_home_member(id)
  returning * into updated;

  if updated.id is null then
    raise exception 'Home not found';
  end if;

  return updated;
end;
$$;

create or replace function public.remove_home_member(
  p_home_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'The host cannot remove themselves';
  end if;

  if not exists (
    select 1
    from public.home_members
    where home_id = p_home_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'Only the host can remove members';
  end if;

  delete from public.home_members
  where home_id = p_home_id
    and user_id = p_user_id
    and role <> 'owner';

  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "Read profiles in same home" on public.profiles;
create policy "Read profiles in same home"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.home_members mine
      join public.home_members theirs
        on mine.home_id = theirs.home_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Insert own profile" on public.profiles;
create policy "Insert own profile"
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "Users manage own profile" on public.profiles;

drop policy if exists "Members can read their home" on public.homes;
create policy "Members can read their home"
  on public.homes for select
  using (public.is_home_member(id));

drop policy if exists "Signed-in users can look up homes" on public.homes;

drop policy if exists "Signed-in users can create a home" on public.homes;

drop policy if exists "Members can update their home" on public.homes;
create policy "Members can update their home"
  on public.homes for update
  using (public.is_home_member(id))
  with check (public.is_home_member(id));

drop policy if exists "Members can read membership" on public.home_members;
create policy "Members can read membership"
  on public.home_members for select
  using (user_id = auth.uid() or public.is_home_member(home_id));

drop policy if exists "Users can join a home" on public.home_members;

drop policy if exists "Members can read items" on public.items;
create policy "Members can read items"
  on public.items for select
  using (public.is_home_member(home_id));

drop policy if exists "Members can add items" on public.items;
create policy "Members can add items"
  on public.items for insert
  with check (public.is_home_member(home_id) and added_by = auth.uid());

drop policy if exists "Members can update items" on public.items;
create policy "Members can update items"
  on public.items for update
  using (public.is_home_member(home_id))
  with check (public.is_home_member(home_id));

drop policy if exists "Members can delete items" on public.items;
create policy "Members can delete items"
  on public.items for delete
  using (public.is_home_member(home_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke insert, update, delete on public.homes from authenticated;
grant select on public.homes to authenticated;
revoke insert, update, delete on public.home_members from authenticated;
grant select on public.home_members to authenticated;
grant select, insert, update, delete on public.items to authenticated;
revoke all on function public.ensure_profile() from public, anon;
revoke all on function public.create_home(text) from public, anon;
revoke all on function public.join_home(text) from public, anon;
revoke all on function public.is_home_member(uuid) from public, anon;
revoke all on function public.get_my_home() from public, anon;
revoke all on function public.list_home_items() from public, anon;
revoke all on function public.add_item(uuid, text, numeric, text, text, text) from public, anon;
revoke all on function public.mark_item_bought(uuid) from public, anon;
revoke all on function public.update_home_name(uuid, text) from public, anon;
revoke all on function public.remove_home_member(uuid, uuid) from public, anon;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.create_home(text) to authenticated;
grant execute on function public.join_home(text) to authenticated;
grant execute on function public.is_home_member(uuid) to authenticated;
grant execute on function public.get_my_home() to authenticated;
grant execute on function public.list_home_items() to authenticated;
grant execute on function public.add_item(uuid, text, numeric, text, text, text) to authenticated;
grant execute on function public.mark_item_bought(uuid) to authenticated;
grant execute on function public.update_home_name(uuid, text) to authenticated;
grant execute on function public.remove_home_member(uuid, uuid) to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
do $$
begin
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
exception
  when others then
    begin
      create trigger on_auth_user_created
        after insert on auth.users
        for each row execute procedure public.handle_new_user();
    exception
      when others then
        null;
    end;
end;
$$;

notify pgrst, 'reload schema';
