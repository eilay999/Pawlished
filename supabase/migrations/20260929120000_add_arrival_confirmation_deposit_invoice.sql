-- Arrival confirmation, Bit deposit tracking and automatic invoice tracking per appointment.
alter table public.appointments
  add column if not exists arrival_confirmed_at timestamptz,
  add column if not exists deposit_amount numeric(10, 2),
  add column if not exists deposit_requested_at timestamptz,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists invoice_number text,
  add column if not exists invoice_url text,
  add column if not exists invoice_issued_at timestamptz,
  add column if not exists invoice_error text;

-- Completed appointments still waiting for an invoice (used by the cron job).
create index if not exists idx_appointments_invoice_pending
  on public.appointments(date)
  where status = 'COMPLETED' and invoice_issued_at is null;
