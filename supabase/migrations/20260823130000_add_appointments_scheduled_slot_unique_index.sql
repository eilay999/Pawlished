-- Prevent two simultaneous booking requests from creating a double-booking at the
-- exact same start time. Scoped to SCHEDULED only (not CANCELLED/COMPLETED/LATE) so it
-- doesn't collide with pre-existing historical duplicate timestamps in completed records
-- (two pairs of pre-existing COMPLETED duplicates were found and left untouched).
create unique index if not exists appointments_scheduled_slot_unique
  on public.appointments(date)
  where status = 'SCHEDULED';
