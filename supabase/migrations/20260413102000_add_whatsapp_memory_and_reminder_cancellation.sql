create table if not exists public.whatsapp_memories (
  id text primary key,
  phone text not null,
  memory_key text not null,
  subject text not null,
  value text not null,
  raw_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_memories_phone_key
  on public.whatsapp_memories(phone, memory_key);

create index if not exists idx_whatsapp_memories_phone_updated
  on public.whatsapp_memories(phone, updated_at desc);

drop trigger if exists trg_whatsapp_memories_updated_at on public.whatsapp_memories;
create trigger trg_whatsapp_memories_updated_at
before update on public.whatsapp_memories
for each row execute function public.set_updated_at();

alter table public.whatsapp_memories disable row level security;

grant select, insert, update, delete on table public.whatsapp_memories to anon, authenticated;

alter table public.whatsapp_reminders
  add column if not exists cancelled_at timestamptz;

drop index if exists public.idx_whatsapp_reminders_due;

create index if not exists idx_whatsapp_reminders_due
  on public.whatsapp_reminders(remind_at asc)
  where sent_at is null and cancelled_at is null;

alter table public.whatsapp_contexts
  drop constraint if exists whatsapp_contexts_pending_kind_check;

alter table public.whatsapp_contexts
  add constraint whatsapp_contexts_pending_kind_check
  check (pending_kind in ('APPOINTMENT', 'CUSTOMER', 'APPOINTMENT_CONFIRMATION', 'QUICK_REMINDER'));
