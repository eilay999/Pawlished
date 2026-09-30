-- Per-IP rate limiting for OTP sends (SMS/WhatsApp pumping protection).
alter table public.wa_otp
  add column if not exists ip_hash text;

create index if not exists idx_wa_otp_ip_hash_created_at
  on public.wa_otp(ip_hash, created_at desc)
  where ip_hash is not null;
