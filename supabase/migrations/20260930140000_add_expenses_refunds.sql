-- Expenses and refunds (server side only: no policies, no anon/authenticated access).
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  vendor text,
  description text,
  amount numeric(10, 2) not null check (amount > 0),
  vat_amount numeric(10, 2) not null default 0 check (vat_amount >= 0),
  receipt_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  refund_date date not null,
  appointment_id text references public.appointments(id) on delete set null,
  customer_name text,
  amount numeric(10, 2) not null check (amount > 0),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expenses(expense_date desc);
create index if not exists idx_refunds_date on public.refunds(refund_date desc);
create index if not exists idx_refunds_appointment on public.refunds(appointment_id);

revoke all on public.expenses from anon, authenticated;
revoke all on public.refunds from anon, authenticated;
alter table public.expenses enable row level security;
alter table public.refunds enable row level security;

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at before update on public.expenses
for each row execute function public.set_updated_at();
drop trigger if exists trg_refunds_updated_at on public.refunds;
create trigger trg_refunds_updated_at before update on public.refunds
for each row execute function public.set_updated_at();

-- Private bucket for expense receipt images/PDFs (service role only).
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;
