-- DEV ONLY. Do not run this on the production project.
-- Production accounts must confirm email before signing in.

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
