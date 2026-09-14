-- DEPRECATED: use setup.sql for new databases and production-hardening.sql
-- for existing databases. Kept only for installations that previously used it.

alter table public.home_members
  drop constraint if exists home_members_user_id_fkey;

alter table public.home_members
  add constraint home_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.items
  drop constraint if exists items_added_by_fkey;

alter table public.items
  add constraint items_added_by_fkey
  foreign key (added_by) references auth.users (id);

alter table public.items
  drop constraint if exists items_bought_by_fkey;

alter table public.items
  add constraint items_bought_by_fkey
  foreign key (bought_by) references auth.users (id);

drop policy if exists "Insert own profile" on public.profiles;
create policy "Insert own profile"
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.homes to authenticated;
grant select, insert on public.home_members to authenticated;

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

grant execute on function public.ensure_profile() to authenticated;

create or replace function public.generate_invite_code()
returns text
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  code text;
begin
  loop
    code := 'OMT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.homes where invite_code = code);
  end loop;
  return code;
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

grant execute on function public.create_home(text) to authenticated;

drop policy if exists "Members can read membership" on public.home_members;
create policy "Members can read membership"
  on public.home_members for select
  using (user_id = auth.uid());

drop policy if exists "Members can read their home" on public.homes;
create policy "Members can read their home"
  on public.homes for select
  using (
    exists (
      select 1
      from public.home_members
      where home_id = homes.id
        and user_id = auth.uid()
    )
  );

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

grant execute on function public.get_my_home() to authenticated;

drop policy if exists "Signed-in users can look up homes" on public.homes;
drop policy if exists "Signed-in users can create a home" on public.homes;
drop policy if exists "Users can join a home" on public.home_members;
revoke insert, update, delete on public.homes from authenticated;
revoke insert, update, delete on public.home_members from authenticated;

notify pgrst, 'reload schema';
