create table if not exists public.whatsapp_contexts (
  phone text primary key,
  pending_kind text not null check (pending_kind in ('APPOINTMENT', 'CUSTOMER')),
  payload jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  source_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_contexts_updated_at
  on public.whatsapp_contexts(updated_at desc);

drop trigger if exists trg_whatsapp_contexts_updated_at on public.whatsapp_contexts;
create trigger trg_whatsapp_contexts_updated_at
before update on public.whatsapp_contexts
for each row execute function public.set_updated_at();

alter table public.whatsapp_contexts disable row level security;

grant select, insert, update, delete on table public.whatsapp_contexts to anon, authenticated;
