-- Secure the Pawlished CRM. Public booking continues through server-side API
-- routes that use the service role; the browser may only access business data
-- after an authenticated user is explicitly added to app_admins.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

drop policy if exists "Admins can read their membership" on public.app_admins;
create policy "Admins can read their membership"
  on public.app_admins
  for select
  to authenticated
  using (user_id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers',
    'appointments',
    'tasks',
    'calendar_events',
    'whatsapp_reminders',
    'whatsapp_contexts',
    'whatsapp_memories',
    'whatsapp_learning_events',
    'whatsapp_messages'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon', table_name);
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        table_name
      );
      execute format('drop policy if exists "Pawlished admins" on public.%I', table_name);
      execute format(
        'create policy "Pawlished admins" on public.%I for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin())',
        table_name
      );
    end if;
  end loop;
end;
$$;

-- OTP rows are private implementation details. Only service-role API routes
-- should ever read or write them.
alter table public.wa_otp enable row level security;
revoke all on table public.wa_otp from anon, authenticated;

-- Stop direct anonymous access even if an older migration granted it.
revoke all on table public.app_admins from anon;
grant select on table public.app_admins to authenticated;

-- Prevent two public requests from creating the exact same start time.
create unique index if not exists appointments_active_start_unique
  on public.appointments(date)
  where status <> 'CANCELLED';
