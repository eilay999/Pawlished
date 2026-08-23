-- Business schedule configuration (working days/hours + booking window).

create table if not exists public.business_schedule (
  id text primary key,
  weekly_slots jsonb not null default '{}'::jsonb,
  max_booking_days_ahead integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_business_schedule_updated_at on public.business_schedule;
create trigger trg_business_schedule_updated_at
before update on public.business_schedule
for each row execute function public.set_updated_at();

-- Seed default schedule (matches the hardcoded defaults used previously).
insert into public.business_schedule (id, weekly_slots, max_booking_days_ahead)
values (
  'default',
  '{
    "0": ["07:00", "08:00"],
    "1": ["09:00", "12:00", "15:00"],
    "2": ["09:00", "12:00", "15:00"],
    "3": ["08:00", "11:00", "14:00"],
    "4": ["07:00", "08:00"],
    "5": ["07:00", "08:00"],
    "6": []
  }'::jsonb,
  30
)
on conflict (id) do nothing;

-- RLS on (no policies -> not accessible from anon/authenticated).
alter table public.business_schedule enable row level security;

