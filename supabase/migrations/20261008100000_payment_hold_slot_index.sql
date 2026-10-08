-- Online bookings can wait for their deposit as PENDING_PAYMENT (see OPERATIONS.md section 10).
-- A hold must block its slot exactly like a confirmed appointment, so the "one groomer, one
-- appointment per timestamp" unique index now covers both statuses. A hold that times out becomes
-- EXPIRED and drops out of the index on its own, which is what frees the slot again.
-- The new index is created before the old one is dropped so the slot is never unprotected.
create unique index if not exists appointments_active_slot_unique
  on public.appointments (date)
  where status in ('SCHEDULED', 'PENDING_PAYMENT');

drop index if exists public.appointments_scheduled_slot_unique;
