-- Per-visit grooming/cut details, attached to a dog (not just an appointment),
-- so the history survives even if the calendar entry is later deleted.

create table public.grooming_records (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  appointment_id text references public.appointments(id) on delete set null,
  visit_date timestamptz not null default now(),
  body_note text,
  legs_note text,
  face_note text,
  head_note text,
  tail_note text,
  nails_done boolean not null default false,
  ears_cleaned boolean not null default false,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

revoke all on public.grooming_records from anon, authenticated;
alter table public.grooming_records enable row level security;
