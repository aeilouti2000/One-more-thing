-- Confirm every existing Auth user so they can log in
-- without checking email. Run once in SQL Editor.

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
