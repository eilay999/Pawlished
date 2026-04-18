create table if not exists public.whatsapp_messages (
  id text primary key,
  phone text not null,
  direction text not null check (direction in ('INCOMING', 'OUTGOING', 'SYSTEM')),
  body text not null,
  message_type text not null default 'text',
  intent_kind text,
  needs_human boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_messages_phone_created
  on public.whatsapp_messages(phone, created_at desc);

create index if not exists idx_whatsapp_messages_needs_human
  on public.whatsapp_messages(needs_human, created_at desc);

alter table public.whatsapp_messages disable row level security;

grant select, insert, update, delete on table public.whatsapp_messages to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.whatsapp_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;
