-- Key/value business settings (tax status etc.). Server side only: no policies, no anon access.
create table if not exists public.business_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

revoke all on public.business_settings from anon, authenticated;
alter table public.business_settings enable row level security;

insert into public.business_settings (key, value) values
  ('tax_status', '"EXEMPT"'::jsonb),
  ('vat_rate', '0.18'::jsonb),
  ('exempt_ceiling', '120000'::jsonb)
on conflict (key) do nothing;
