-- Lock down direct client access to the database.
-- This app should only access the database through server-side APIs using the service role key.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Defense in depth: enable RLS on core tables (no policies = no access for anon/authenticated).
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.tasks enable row level security;
alter table public.wa_otp enable row level security;

