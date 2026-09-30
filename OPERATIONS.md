# Operations Runbook (Vercel + Supabase)

This project now includes repeatable control commands for deployment and database operations.

## 1) One-time setup

1. Copy `.env.example` to `.env.local`.
2. Fill all required values.
3. Login CLIs:
   - `npx vercel login`
   - `npx supabase@latest login`
4. Link Supabase project:
   - set `SUPABASE_PROJECT_REF` in your shell or `.env.local`
   - run `npm run supabase:link`

## 2) Health check

Run:

```bash
npm run ops:status
```

This checks that expected env keys exist and that `vercel.json` + `supabase/migrations` are present.

## 3) Vercel control

```bash
npm run vercel:pull
npm run vercel:env:ls
npm run vercel:deploy
npm run vercel:logs
```

## 4) Supabase control

```bash
npm run supabase:push
npm run supabase:types
```

- SQL migrations are in `supabase/migrations/`.
- Current baseline schema is in `supabase/migrations/20260216170000_core_schema.sql`.
- Business schedule is stored in `public.business_schedule` (seeded by `supabase/migrations/20260505100000_add_business_schedule.sql`).
- `supabase/migrations/20260504120000_lock_down_public_access.sql` revokes direct `anon/authenticated` access (admin + booking should use `/api/*` endpoints only).

## 5) Required Vercel env vars (Production/Preview)

- `VITE_GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OTP_SECRET`
- `ADMIN_PHONES` (comma-separated allowlist for admin app access)
- `MESSAGING_CHANNEL` (`auto` | `sms` | `whatsapp`)

Legacy (only if you re-enable direct client Supabase access):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Messaging provider requirements:

- If channel resolves to WhatsApp:
  - `WHATSAPP_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_OTP_TEMPLATE`
  - `WHATSAPP_CONFIRM_TEMPLATE`
- If channel resolves to SMS (Twilio):
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_NUMBER`

Optional:

- `WHATSAPP_OTP_LANG`
- `WHATSAPP_CONFIRM_LANG`
- `OTP_TTL_MIN`
- `OTP_COOLDOWN_SEC`
- `OTP_MAX_10MIN`
- `OTP_SECRET_MIN_BYTES` (default `32`)
- `OTP_SESSION_TTL_MIN`
- `BUSINESS_SCHEDULE_CACHE_TTL_SEC`
- `REMINDER_DAY_BEFORE_TIME` (default `18:00` Israel time)
- `REMINDER_PROVIDER_LABEL` (e.g. `אגם הספרית` / `פוליש`)

WhatsApp assistant modes:

- `WHATSAPP_OWNER_PHONES` (comma-separated): phone numbers that are treated as business owners/admins (internal assistant + human reply commands enabled).
- `WHATSAPP_PUBLIC_CUSTOMER_MODE` (`true` | `false`): when `true`, WhatsApp Cloud API messages from customers use the customer booking flow by default.
- `WHATSAPP_CUSTOMER_ONLY_BOOKING` (`true` | `false`): when `true` (default), customers get booking + FAQ only, otherwise they can also ask general questions (AI) if configured.

Human reply (owner phone -> customer):

- Send to the bot: `השב ל-9725XXXXXXXX: הטקסט שלך`

## 6) Appointment reminders (day before)

Reminders are queued into `public.whatsapp_reminders` when an appointment is created or updated.

To send them automatically, schedule a job to hit `GET /api/reminders-run`:

- Recommended (Pro): run every 5-10 minutes.
- Hobby plan note: Vercel Cron Jobs can only run once per day; for frequent scheduling use an external scheduler and protect it with `CRON_SECRET` (send `Authorization: Bearer <CRON_SECRET>`).

## 7) Arrival confirmation, Bit deposit, automatic invoices

- The day-before reminder asks the customer to reply `1` to confirm (webhook sets `appointments.arrival_confirmed_at`) and, when `BIT_PAYMENT_LINK` is set, asks for the ₪`DEPOSIT_AMOUNT` (default 50) Bit deposit.
- `/api/reminders-run` also issues invoices for `COMPLETED` appointments with `price > 0` and no invoice yet (`INVOICE_API_URL` / `INVOICE_API_KEY`), then WhatsApps the link to the customer. Failures are stored in `appointments.invoice_error` and retried on the next run.
- The provider request/response mapping is in `callInvoiceProvider` (`api/_lib/invoices.js`) and must be aligned with the provider's API docs.
- Run migration `20260929120000_add_arrival_confirmation_deposit_invoice.sql` (`npm run supabase:push`).
- The cron must actually run: schedule an external job hitting `/api/reminders-run` every 5-10 minutes with `Authorization: Bearer <CRON_SECRET>`.

## 8) Security notes

- OTP verification allows `OTP_MAX_VERIFY_ATTEMPTS` (default 5) wrong guesses per code, then the code is burned. Requires migration `20260930100000_otp_verify_attempts.sql`; without it the code is burned on the first wrong guess (fail closed).
- **Set `WHATSAPP_WEBHOOK_SECRET` in production and add `?secret=...` to the Meta webhook URL.** If it is unset, `/api/whatsapp-webhook` accepts unauthenticated requests.
- `ADMIN_PHONES`, `OTP_SECRET` (>= 32 bytes) and `CRON_SECRET` must be set; rotate any secret that was ever shared in chat.
- Security headers (nosniff, frame deny, HSTS, referrer, permissions) are set in `vercel.json`. A Content-Security-Policy is intentionally not set yet (needs testing against Google Fonts/Supabase).
