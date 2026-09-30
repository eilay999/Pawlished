-- Limit wrong-code guesses per OTP (brute-force protection on /api/whatsapp-otp verify).
alter table public.wa_otp
  add column if not exists attempts integer not null default 0;
