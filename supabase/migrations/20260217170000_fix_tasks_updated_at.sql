-- Fix drift where tasks updates trigger references NEW.updated_at
-- but the column is missing in some remote environments.
alter table public.tasks
add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();
