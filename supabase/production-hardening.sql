-- Run once in Supabase SQL Editor before distributing a production build.
-- Safe to run repeatedly.

drop policy if exists "Signed-in users can look up homes" on public.homes;
drop policy if exists "Signed-in users can create a home" on public.homes;
drop policy if exists "Users can join a home" on public.home_members;
drop policy if exists "Users manage own profile" on public.profiles;

revoke insert, update, delete on public.homes from authenticated;
grant select on public.homes to authenticated;

revoke insert, update, delete on public.home_members from authenticated;
grant select on public.home_members to authenticated;

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

notify pgrst, 'reload schema';

-- Verify: homes/home_members should not allow insert for authenticated.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in ('homes', 'home_members', 'items', 'profiles')
order by table_name, privilege_type;
