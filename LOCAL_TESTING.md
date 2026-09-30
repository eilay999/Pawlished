# בדיקה במחשב שלך לפני שמעלים לאתר

**העיקרון:** שום שינוי לא עולה לאתר החי עד שמבצעים **מיזוג ל-`main`**. כל העבודה שלי נדחפת לענף נפרד (`claude/...`), ו-Vercel בונה לו אתר תצוגה מקדימה נפרד. בנוסף אפשר להריץ הכול אצלך על המחשב, **בלי לשלוח הודעות אמיתיות ובלי לגעת בנתונים האמיתיים**.

## מה צריך להתקין (פעם אחת)
- Node.js 22 (nodejs.org) ו-Git.
- (אופציונלי, למסד נתונים מקומי) Docker Desktop.

## הרצה
```bash
git clone https://github.com/eilay999/Pawlished.git
cd Pawlished
git checkout claude/eager-sagan-sucxed     # הענף שרוצים לבדוק
npm ci
```

### 1. קובץ הגדרות מקומי `.env.local`
צור קובץ בשם `.env.local` בתיקיית הפרויקט (הוא לא עולה ל-git):
```
MESSAGING_DRY_RUN=true
OTP_SECRET=any-long-random-text-of-at-least-32-characters
ADMIN_PHONES=05XXXXXXXX
WHATSAPP_TOKEN=dummy
WHATSAPP_PHONE_NUMBER_ID=dummy
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<מתקבל ב-supabase start, ראו למטה>
```
- `MESSAGING_DRY_RUN=true` **חובה**: כל שליחת הודעה או תשלום רק נרשמת במסוף ולא יוצאת. קוד האימות (OTP) יופיע בחלון המסוף, ואפשר להקליד אותו.
- ערכי `dummy` הם רק כדי שהמערכת תחשוב שיש ערוץ הודעות.
- **אל תכניס לקובץ הזה מפתחות של הפרודקשן.** אם `SUPABASE_URL` לא מקומי, המערכת מסרבת לעלות.

### 2. מסד נתונים מקומי (דורש Docker; לא נבדק עדיין)
```bash
npx supabase init
npx supabase start
```
ההדפסה תכלול `API URL` ו-`service_role key`: להעתיק ל-`.env.local`. המיגרציות מהתיקייה `supabase/migrations` אמורות להיטען לבד. אם משהו נכשל, תשלח לי את השגיאה.
(אלטרנטיבה: פרויקט Supabase נפרד לבדיקות, ראו `STAGING.md`, ואז מוסיפים את הכתובת שלו ל-`DRY_RUN_ALLOWED_DB_HOSTS`.)

### 3. להפעיל שני חלונות מסוף
```bash
npm run dev:api      # שרת ה-API המקומי (פורט 3100)
npm run dev          # האתר: http://localhost:3000   (או npm run dev:client לדף ההזמנה, פורט 3001)
```

## איך בודקים שינוי
1. `git pull` בענף.
2. מריצים כמו למעלה, בודקים בדפדפן ובמסוף.
3. אם משהו לא נראה טוב, כותבים לי ומתקנים **לפני** המיזוג.
4. מוכן? ממזגים את ה-PR ב-GitHub. רק אז זה עולה לאתר.

## הגנה מפני טעויות
- מומלץ להפעיל ב-GitHub: **Settings ← Branches ← Add rule ל-`main`** עם "Require a pull request before merging", כדי שאף אחד לא ידחוף ישירות לפרודקשן.
- כל ענף של Claude נבנה ב-Vercel כתצוגה מקדימה נפרדת, אבל היא עדיין מצביעה על מסד הנתונים האמיתי אם אין לה משתני Preview נפרדים (ראו `STAGING.md`). **לבדיקות שכוללות שמירת נתונים, עדיף מקומי.**
