-- Run once in the Supabase SQL Editor for an existing installation.
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

grant execute on function public.remove_home_member(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
