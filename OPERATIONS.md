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
