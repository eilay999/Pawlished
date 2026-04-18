create table if not exists public.calendar_events (
  id text primary key,
  title text not null,
  starts_at timestamptz not null,
  kind text not null check (kind in ('EVENT')),
  color_key text not null default 'PERSONAL',
  show_in_calendar boolean not null default true,
  blocks_time boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_reminders (
  id text primary key,
  source_kind text not null check (source_kind in ('APPOINTMENT', 'EVENT', 'QUICK_REMINDER')),
  source_id text,
  phone text not null,
  title text not null,
  remind_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_events_starts_at
  on public.calendar_events(starts_at asc);

create index if not exists idx_whatsapp_reminders_due
  on public.whatsapp_reminders(remind_at asc)
  where sent_at is null;

drop trigger if exists trg_calendar_events_updated_at on public.calendar_events;
create trigger trg_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists trg_whatsapp_reminders_updated_at on public.whatsapp_reminders;
create trigger trg_whatsapp_reminders_updated_at
before update on public.whatsapp_reminders
for each row execute function public.set_updated_at();

alter table public.calendar_events disable row level security;
alter table public.whatsapp_reminders disable row level security;

grant select, insert, update, delete on table public.calendar_events to anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_reminders to anon, authenticated;

alter table public.whatsapp_contexts
  drop constraint if exists whatsapp_contexts_pending_kind_check;

alter table public.whatsapp_contexts
  add constraint whatsapp_contexts_pending_kind_check
  check (pending_kind in ('APPOINTMENT', 'CUSTOMER', 'APPOINTMENT_CONFIRMATION'));
