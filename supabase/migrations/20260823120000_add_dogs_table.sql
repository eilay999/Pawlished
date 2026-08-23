-- Split "customer" and "dog" into separate entities: a customer can own multiple dogs.
-- Additive/non-destructive: existing customers.* pet columns and appointments.customer_id
-- are left in place untouched (not dropped) so nothing already reading them breaks.

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.customers(id) on delete cascade,
  name text not null,
  breed text,
  sex text check (sex in ('MALE', 'FEMALE')),
  size text check (size in ('SMALL', 'MEDIUM', 'LARGE')),
  weight_kg numeric,
  allergies text,
  medical_notes text,
  behavior_notes text,
  notes text,
  photo_url text,
  last_visit timestamptz,
  visit_frequency_weeks integer default 4,
  default_price numeric,
  lifecycle_status text default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Backfill: one dog per existing customer, carrying over their pet fields as-is.
insert into public.dogs (
  customer_id, name, breed, last_visit, visit_frequency_weeks,
  default_price, lifecycle_status, notes
)
select id, pet_name, pet_type, last_visit, visit_frequency_weeks,
       default_price, lifecycle_status, notes
from public.customers;

alter table public.appointments add column dog_id uuid references public.dogs(id);

-- Safe because backfill above is 1:1 (one dog per customer) at this point.
update public.appointments a
set dog_id = d.id
from public.dogs d
where d.customer_id = a.customer_id
  and a.dog_id is null;

-- Lock down direct access the same way 20260504120000_lock_down_public_access.sql
-- did for the other tables: admin + booking must go through /api/* only.
revoke all on public.dogs from anon, authenticated;
alter table public.dogs enable row level security;
