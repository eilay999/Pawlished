-- Core schema for Pawlished app.
-- Uses text IDs because the app currently generates client-side string IDs.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text not null,
  pet_name text not null,
  pet_type text not null,
  last_visit timestamptz not null,
  visit_frequency_weeks integer not null default 4,
  default_price numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  date timestamptz not null,
  service text not null,
  status text not null check (status in ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'LATE')),
  notes text,
  price numeric(10, 2) not null default 0,
  cancellation_fee numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  title text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'DONE')),
  created_at timestamptz not null default now(),
  start_date timestamptz not null default now()
);

create table if not exists public.wa_otp (
  id bigint generated always as identity primary key,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_appointments_customer_id on public.appointments(customer_id);
create index if not exists idx_appointments_date on public.appointments(date);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_wa_otp_phone_created_at on public.wa_otp(phone, created_at desc);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

-- Current app uses anon key directly from client without Supabase Auth session.
-- Keep RLS disabled unless client auth flow and policies are introduced.
alter table public.customers disable row level security;
alter table public.appointments disable row level security;
alter table public.tasks disable row level security;
alter table public.wa_otp disable row level security;
