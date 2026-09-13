-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run again.

create extension if not exists pgcrypto;

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
  category text not null check (category in ('market', 'household', 'personal', 'other')),
  notes text,
  status text not null default 'needed' check (status in ('needed', 'bought')),
  added_by uuid not null references auth.users (id),
  bought_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  bought_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.home_members enable row level security;
alter table public.items enable row level security;

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
    code := 'OMT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    exit when not exists (select 1 from public.homes where invite_code = code);
  end loop;
  return code;
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

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
  on public.profiles for select
  using (id = auth.uid());

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
create policy "Users manage own profile"
  on public.profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Signed-in users can look up homes" on public.homes;
create policy "Signed-in users can look up homes"
  on public.homes for select
  using (auth.uid() is not null);

drop policy if exists "Signed-in users can create a home" on public.homes;
create policy "Signed-in users can create a home"
  on public.homes for insert
  with check (auth.uid() is not null);

drop policy if exists "Users can join a home" on public.home_members;
create policy "Users can join a home"
  on public.home_members for insert
  with check (user_id = auth.uid());

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.homes to authenticated;
grant select, insert on public.home_members to authenticated;
grant select, insert, update on public.items to authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.create_home(text) to authenticated;
grant execute on function public.join_home(text) to authenticated;
grant execute on function public.is_home_member(uuid) to authenticated;

notify pgrst, 'reload schema';
