-- Run once in the Supabase SQL Editor for an existing installation.
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

drop policy if exists "Members can update their home" on public.homes;
create policy "Members can update their home"
  on public.homes for update
  using (public.is_home_member(id))
  with check (public.is_home_member(id));

grant update on public.homes to authenticated;
grant execute on function public.update_home_name(uuid, text) to authenticated;

notify pgrst, 'reload schema';
