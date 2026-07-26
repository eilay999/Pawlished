# Pawlished CRM

## Local development

1. Install dependencies:
   - `npm install`
2. Create `.env.local` from `.env.example`.
3. Run:
   - `npm run dev`

## Build

- `npm run build`
- `npm run typecheck`
- `npm test`

## Secure admin setup

The CRM is private. Public customers only use `/booking`.

1. Apply all Supabase migrations, including
   `20260726190000_secure_admin_access.sql`.
2. In Supabase Authentication, create an email/password user for each manager.
3. Copy the user's UUID and add it in the Supabase SQL editor:

```sql
insert into public.app_admins (user_id, display_name)
values ('AUTH_USER_UUID', 'Agam');
```

4. Disable public email sign-ups in Supabase Authentication settings.
5. Configure a strong `OTP_SECRET` (at least 24 random characters).
6. Use `GEMINI_API_KEY` only as a server-side Vercel variable. Do not create
   `VITE_GEMINI_API_KEY`.

The migration enables RLS and revokes anonymous access to customer, appointment,
task, reminder, and WhatsApp data. Server-side public-booking routes use the
service role and return only the minimum information needed by the booking UI.

## Vercel + Supabase control

Operational commands are documented in `OPERATIONS.md`.

Quick check:

- `npm run ops:status`
