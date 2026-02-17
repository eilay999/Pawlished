-- Harden updated_at trigger behavior against schema drift.
-- If a table misses updated_at, trigger should not crash writes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Populate known fields only; unknown keys are ignored for the target row type.
  new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  return new;
end;
$$;

alter table public.customers
add column if not exists updated_at timestamptz not null default now();

alter table public.appointments
add column if not exists updated_at timestamptz not null default now();

alter table public.tasks
add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();
