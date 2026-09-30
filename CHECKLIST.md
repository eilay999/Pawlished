# צ'קליסט הפעלה — תזכורות, מקדמה, חשבוניות, אבטחה

## א. מסד נתונים (Supabase) — `npm run supabase:push`
- [ ] `20260929120000_add_arrival_confirmation_deposit_invoice.sql` (אישור הגעה, מקדמה, חשבונית)
- [ ] `20260930100000_otp_verify_attempts.sql` (הגבלת ניסיונות אימות)
- [ ] `20260930110000_otp_ip_rate_limit.sql` (הגבלת קצב לפי IP)

## ב. משתני סביבה (Vercel → Production + Preview)
- [ ] `WHATSAPP_WEBHOOK_SECRET` + `?secret=...` בכתובת ה-webhook ב-Meta (**חובה** — בלעדיו ה-webhook פתוח)
- [ ] `CRON_SECRET`, `OTP_SECRET` (32+ תווים), `ADMIN_PHONES`
- [ ] `BIT_PAYMENT_LINK`, `DEPOSIT_AMOUNT=50`
- [ ] `INVOICE_API_URL`, `INVOICE_API_KEY` (אחרי שיש ספק)

## ג. תזמון
- [ ] מתזמן חיצוני (למשל cron-job.org) שקורא כל 5–10 דקות ל-`/api/reminders-run` עם `Authorization: Bearer <CRON_SECRET>`

## ד. משפטי ותוכן (להשלים לפני פרסום)
- [ ] `public/terms.html` — השלמת שדות בסוגריים + עבירה עם יועץ
- [ ] `public/accessibility.html` — רכז נגישות, טלפון, דוא"ל, תאריך
- [ ] `public/privacy-policy.html` — עדכון (תשלומים, חשבוניות, הודעות)
- [ ] התייעצות עם רו"ח: קבלה על מקדמה מול חשבונית סופית

## ה. ספק תשלומים/חשבוניות
- [ ] תשובות הספק (API, webhooks, חשבוניות עם הקצאה, ביט, מע"מ, ביטול מנוי)
- [ ] מפתחות API במשתני הסביבה (לא בצ'אט)
- [ ] בנייה: קישור מקדמה, קישור יתרה, webhook, חשבונית אוטומטית

## ו. סביבת בדיקות
- [ ] חיבור מחדש של Vercel ל-Claude
- [ ] פרויקט Supabase נפרד ל-Preview + משתני Preview נפרדים
- [ ] בדיקת Lighthouse/axe ובדיקת מקלדת על דף ההזמנה

## ז. אבטחה — פתוח
- [ ] אימות חתימה של Meta על ה-webhook
- [ ] Content-Security-Policy (לבדוק ב-Preview)
