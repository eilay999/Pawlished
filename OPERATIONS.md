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

## 5) Required Vercel env vars (Production/Preview)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OTP_SECRET`
- `MESSAGING_CHANNEL` (`auto` | `sms` | `whatsapp`)

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
