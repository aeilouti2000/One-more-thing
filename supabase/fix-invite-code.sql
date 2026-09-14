-- Fixes: create_home fails with
-- "function gen_random_bytes(integer) does not exist"
-- Run once in the Supabase SQL Editor.

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

grant execute on function public.generate_invite_code() to authenticated;
