# סביבת בדיקות (Preview) נפרדת מהפרודקשן

מטרה: כל ענף/PR ב-Vercel יוצר אתר תצוגה מקדימה שמדבר עם מסד נתונים **נפרד** (בלי לקוחות אמיתיים), כך שאפשר לראות ולנסות שינויים לפני שמעלים.

## 1. מסד נתונים נפרד ב-Supabase
1. ב-Supabase: New project בשם `pawlished-staging` (אותו ארגון). בדוק בדף יצירת הפרויקט אם יש עלות לפני שמאשרים.
2. שמור את סיסמת מסד הנתונים ואת ה-Project ref.
3. החל את כל המיגרציות על הפרויקט החדש (לא על הפרודקשן):
   ```bash
   export SUPABASE_PROJECT_REF=<staging-ref>
   npm run supabase:link
   npm run supabase:push
   ```
4. ודא שלא הועתקו נתוני לקוחות אמיתיים. לבדיקות, הוסף לקוח/ת בדיקה עם מספר הטלפון שלך.

## 2. משתני סביבה ב-Vercel (Settings → Environment Variables)
לכל משתנה שמופיע ב-`.env.example` צור ערך נפרד עם **Environment = Preview בלבד** (Production נשאר כמו שהוא):

| משתנה | ערך ב-Preview |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | של `pawlished-staging` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | של `pawlished-staging` (אם בשימוש) |
| `OTP_SECRET` | סוד חדש (32+ תווים), שונה מהפרודקשן |
| `ADMIN_PHONES` | הטלפון שלך |
| `CRON_SECRET`, `WHATSAPP_WEBHOOK_SECRET` | סודות חדשים |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | **להשאיר ריק** — ב-Preview לא נשלחות הודעות אמיתיות. בלי ערוץ הודעות אי אפשר לקבל קוד אימות, ולכן לבדיקות השתמש ב-SMS בחשבון בדיקות או הגדר זמנית מספר שלך |
| `BIT_PAYMENT_LINK`, `INVOICE_API_KEY` | ריק או מפתח בדיקות של הספק |

כלל: אף מפתח של פרודקשן (Supabase, WhatsApp, תשלומים, חשבוניות) לא מופיע ב-Preview.

## 3. עבודה שוטפת
- ענף חדש → Vercel מעלה Preview אוטומטית → בודקים בכתובת ה-Preview.
- מיגרציה חדשה: קודם על staging, ורק אחרי בדיקה על הפרודקשן.
- מיזוג ל-`main` = עלייה לפרודקשן.

## 4. בדיקת הפרדה (אחרי ההגדרה)
- [ ] קביעת תור ב-Preview לא מופיעה ביומן האמיתי
- [ ] אין ב-Preview לקוחות אמיתיים
- [ ] אין ב-Preview הודעות וואטסאפ ללקוחות
