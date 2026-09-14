-- Run once in the Supabase SQL Editor for an existing installation.
drop policy if exists "Members can delete items" on public.items;

create policy "Members can delete items"
  on public.items for delete
  using (public.is_home_member(home_id));

grant delete on public.items to authenticated;
