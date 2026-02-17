-- Make sure frontend anon/authenticated roles can read and write core tables.
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.customers to anon, authenticated;
grant select, insert, update, delete on table public.appointments to anon, authenticated;
grant select, insert, update, delete on table public.tasks to anon, authenticated;
