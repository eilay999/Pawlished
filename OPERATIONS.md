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
- `/api/reminders-run` also issues invoices for `COMPLETED` appointments with `price > 0` and no invoice yet (`INVOICE_API_URL` / `INVOICE_API_KEY`, and `INVOICE_START_DATE` — nothing is issued without a start date, so history is never back-filled), then WhatsApps the link to the customer. Failures are stored in `appointments.invoice_error` and retried on the next run.
- The provider request/response mapping is in `callInvoiceProvider` (`api/_lib/invoices.js`) and must be aligned with the provider's API docs.
- Run migration `20260929120000_add_arrival_confirmation_deposit_invoice.sql` (`npm run supabase:push`).
- The cron must actually run: schedule an external job hitting `/api/reminders-run` every 5-10 minutes with `Authorization: Bearer <CRON_SECRET>`.

## 8) Security notes

- OTP verification allows `OTP_MAX_VERIFY_ATTEMPTS` (default 5) wrong guesses per code, then the code is burned. Requires migration `20260930100000_otp_verify_attempts.sql`; without it the code is burned on the first wrong guess (fail closed).
- **Set `WHATSAPP_WEBHOOK_SECRET` in production and add `?secret=...` to the Meta webhook URL.** If it is unset, `/api/whatsapp-webhook` accepts unauthenticated requests.
- `ADMIN_PHONES`, `OTP_SECRET` (>= 32 bytes) and `CRON_SECRET` must be set; rotate any secret that was ever shared in chat.
- OTP sends are limited per phone (`OTP_MAX_10MIN`) and per IP (`OTP_MAX_10MIN_PER_IP`, default 10); needs migration `20260930110000_otp_ip_rate_limit.sql`.
- Security headers (nosniff, frame deny, HSTS, referrer, permissions) are set in `vercel.json`. A Content-Security-Policy is intentionally not set yet (needs testing against Google Fonts/Supabase).

## 9) Cron (Vercel)

`vercel.json` runs `/api/reminders-run` once a day at 16:30 UTC (19:30/18:30 Israel time, after the 18:00 "day before" reminders are due in both summer and winter time). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically; `CRON_SECRET` is set in Production (sensitive). Hobby plans allow only daily crons and hourly precision; for faster runs (1-hour-before reminders, invoices within minutes) use Pro or an external scheduler.

## 10) Grow deposit payment links

The day-before reminder includes a Grow payment link (card/Bit) for the ₪`DEPOSIT_AMOUNT` deposit when `GROW_USER_ID`, `GROW_PAGE_CODE`, `GROW_NOTIFY_SECRET` and `PUBLIC_BASE_URL` (https) are set; otherwise it falls back to `BIT_PAYMENT_LINK`. Grow calls `/api/whatsapp-webhook?source=grow&a=<appointment>&k=DEPOSIT&t=<hmac>` (routed to `api/_lib/growWebhook.js`) after payment; the HMAC (not the body) authenticates it, the paid sum must be at least the deposit, and then `deposit_paid_at` is set and `approveTransaction` is called.

**Not yet validated against a real Grow account**: test in the sandbox (`GROW_BASE_URL=https://sandbox.meshulam.co.il`) and confirm the request encoding, the `data.url` response field and the callback payload (see `api/_lib/grow.js`) before enabling in production. Balance (remaining amount) links are not implemented yet.

### 10b) Online booking: the slot is held until the deposit is paid

When Grow is configured (`isGrowConfigured()`), a booking made on the public page is **not confirmed immediately**:

1. `api/public-booking/create.js` creates the appointment as `PENDING_PAYMENT` (`deposit_requested_at` = start of the hold) and returns a Grow payment link, which the booking page shows right away. The same link is also sent as a message (free-form WhatsApp inside the 24h window, otherwise SMS if Twilio is configured; best effort).
2. The slot is blocked for `PAYMENT_HOLD_MINUTES` (default 30). If no payment link can be created, the hold is released at once and the customer is told to retry.
3. When Grow calls the webhook, `confirmHeldAppointment` turns the appointment `SCHEDULED`, creates the day-before reminder and sends the confirmation. Repeated callbacks are harmless.
4. An unpaid hold is released (status `EXPIRED`, hidden from the admin) lazily: any availability read, booking, profile read or admin data load first runs `expireStaleHolds`; the daily cron is only a safety net (Hobby plan: no frequent crons).
5. Paid after the release: if the slot is still free the appointment is reinstated; if somebody else took it, it is kept as `CANCELLED` with `deposit_paid_at` set and a note, so it shows up for a refund.
6. The owner can also tick "deposit paid" in the admin to confirm a pending booking by hand.

Without Grow nothing changes: bookings are confirmed immediately as before. A static `BIT_PAYMENT_LINK` cannot confirm automatically (no callback), so this flow needs Grow. Needs migration `20261008100000_payment_hold_slot_index.sql` (extends the one-appointment-per-timestamp index to held slots). Tests: `tests/payment-hold.test.mjs`.

## 11) Daily backup

`/api/reminders-run` (daily cron) also writes a JSON snapshot of the business tables (`appointments`, `customers`, `dogs`, ...) to the private Supabase Storage bucket `backups` (`pawlished-backup-YYYY-MM-DD.json`). It keeps the last 30 days plus the first snapshot of each month for a year, and never overwrites a snapshot when appointments and customers are both empty. It is **not off-site**: download a copy now and then, or use Supabase Pro daily backups. The repository is public, so never commit backups. Needs migration `20260930120000_add_backups_bucket.sql` (already applied to production).

## 12) Local testing

See `LOCAL_TESTING.md`: `MESSAGING_DRY_RUN=true` logs instead of sending WhatsApp/SMS/Grow/invoice requests, refuses a non-local database, is ignored on Vercel production, and `npm run dev:api` serves `/api` locally without the Vercel CLI.

## 13) "Stay signed in" (admin)

The admin login has a "הישאר מחובר (30 יום)" checkbox. It only extends the session for phones in `ADMIN_PHONES` (length: `ADMIN_REMEMBER_DAYS`, default 30); customers booking a slot keep the short `OTP_SESSION_TTL_MIN` session. Sessions are signed tokens (not stored server side), so they cannot be revoked one by one: to sign out every device immediately, change `OTP_SECRET` in Vercel and redeploy (this also signs out customers mid-booking). Use it only on personal devices.

## 14) Reports, yearly tables and tax status

Admin → "דוחות" (REPORTS): income/receipts report by period (this month, last month, this year, last 12 months, custom range), a yearly table by month, "save as PDF" (print view) and CSV export for the accountant, plus the exempt-dealer ceiling indicator (last 12 months vs `exempt_ceiling`, default 120,000, editable; verify the real figure with the accountant).

Tax status lives in `business_settings` (`tax_status` EXEMPT/LICENSED, `vat_rate`, `exempt_ceiling`; migration `20260930130000_add_business_settings.sql`). The "הכן מעבר לעוסק מורשה" button flips it: reports add VAT columns, the invoice request uses `INVOICE_DOCUMENT_TYPE_LICENSED` (default `tax_invoice_receipt`) with `vatIncluded`, and WhatsApp says "החשבונית" instead of "הקבלה". It does NOT change the static legal pages (`public/terms.html`, `public/privacy-policy.html`) or the WhatsApp template wording: those are manual steps listed in the confirmation box. Income = completed treatments (price) + collected cancellation fees; expenses are not tracked yet.

## 15. הנהלת חשבונות לפי שנה (דוחות ← "הנהלת חשבונות לפי שנה")

- טבלאות לפי שנה: סיכום חודשי (הכנסות / החזרים / הוצאות / רווח), הוצאות, החזרים. הכול נשמר במסד (`expenses`, `refunds`).
- קבלות הוצאה (JPG/PNG/PDF עד 3MB) נשמרות בבאקט פרטי `expense-receipts`; הקישור לצפייה תקף ל־2 דקות. סוג הקובץ נבדק לפי התוכן, לא לפי השם.
- "ייצוא תיקיית שנה (ZIP)": תיקייה `YYYY/` עם `הכנסות-וקבלות.csv`, `הוצאות.csv`, `החזרים.csv`, `סיכום-חודשי.csv`.
- Google Drive: אין חיבור אוטומטי. גוררים את התיקייה ל־Drive ← Pawlished פעם בשנה (או בסוף כל רבעון).
- ההוצאות, ההחזרים והגדרות המס נכללים בגיבוי היומי (קבצי הקבלות עצמם נשארים בבאקט `expense-receipts`, מחוץ ל-JSON).
- הסיכום הוא כלי עזר. הדוח הרשמי — מרואה החשבון.
