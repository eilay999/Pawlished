alter table public.whatsapp_contexts
  drop constraint if exists whatsapp_contexts_pending_kind_check;

alter table public.whatsapp_contexts
  add constraint whatsapp_contexts_pending_kind_check
  check (pending_kind in ('APPOINTMENT', 'CUSTOMER', 'APPOINTMENT_CONFIRMATION', 'QUICK_REMINDER', 'TRAINING'));
