-- Fix schema drift: ensure appointments has cancellation_fee column.
alter table public.appointments
add column if not exists cancellation_fee numeric(10, 2);

-- Refresh PostgREST schema cache immediately.
notify pgrst, 'reload schema';
