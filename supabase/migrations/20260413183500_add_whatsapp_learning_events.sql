create table if not exists public.whatsapp_learning_events (
  id text primary key,
  phone text not null,
  direction text not null default 'incoming' check (direction in ('incoming', 'outgoing', 'system')),
  text text not null,
  intent_kind text not null default 'incoming',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_learning_events_phone_created
  on public.whatsapp_learning_events(phone, created_at desc);

create index if not exists idx_whatsapp_learning_events_intent
  on public.whatsapp_learning_events(intent_kind, created_at desc);

alter table public.whatsapp_learning_events disable row level security;

grant select, insert, update, delete on table public.whatsapp_learning_events to anon, authenticated;
