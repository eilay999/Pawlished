# Mobile (Google Play + App Store)

הפרויקט הזה הוא אפליקציית React/Vite. כדי להפיץ אותה כ־App אמיתי ב־Google Play וב־App Store אנחנו משתמשים ב־Capacitor (עטיפה נייטיבית סביב ה־Web App).

## שתי אפליקציות (הנהלה + לקוחות)

הפרויקט תומך עכשיו בשתי אפליקציות נפרדות:

1. **אפליקציית הנהלה (CRM)** – רואים את כל היומן/לקוחות/משימות וכו׳
   - `appId`: `com.pawlished.app`
   - `webDir`: `dist`
   - Native: `android/`, `ios/`

2. **אפליקציית לקוחות (קביעת תורים)** – מסך קביעת תור ציבורי בלבד
   - `appId`: `com.pawlished.booking`
   - `webDir`: `dist-client`
   - Native: `android-client/`, `ios-client/`

הבחירה נעשית דרך משתנה סביבה `PAWLISHED_APP` (ברירת מחדל: הנהלה).

## מצב אבטחה (חשוב לפני חנות)

כרגע ה־CRM/יומן משתמש ב־Supabase `anon` מהקליינט וטבלאות מרכזיות עם RLS כבוי. זה מתאים לשימוש פנימי/סגור, אבל **לא** מומלץ לפרסום ציבורי בחנויות בלי:

- Supabase Auth (משתמשים/תפקידים)
- הפעלה של RLS + Policies על הטבלאות הרלוונטיות
- או מעבר ל־API שרת בלבד (service role) עבור פעולות ניהול

הערה לגבי **אפליקציית לקוחות**: קביעת תור דורשת אימות טלפון (OTP) דרך `/api/whatsapp-otp`.
כדי שזה יעבוד בפרודקשן חייבים להגדיר ב־Vercel את `SUPABASE_SERVICE_ROLE_KEY` + ספק הודעות (WhatsApp Template או Twilio SMS).

## פקודות שימושיות

- יצירת אייקונים/ספלאש (אחרי שינוי `assets/logo*.svg`):
  - `npm run cap:assets`
- יצירת אייקונים/ספלאש (אפליקציית לקוחות):
  - `npm run cap:assets:client`
- סנכרון הווב ל־iOS/Android:
  - `npm run cap:sync`
- סנכרון הווב ל־iOS/Android (אפליקציית לקוחות):
  - `npm run cap:sync:client`
- פתיחה ב־Android Studio:
  - `npm run cap:android`
- פתיחה ב־Android Studio (אפליקציית לקוחות):
  - `npm run cap:android:client`
- פתיחה ב־Xcode (נדרש macOS):
  - `npm run cap:ios`
- פתיחה ב־Xcode (אפליקציית לקוחות, נדרש macOS):
  - `npm run cap:ios:client`

## Android (Google Play)

דרישות:
- Android Studio + Android SDK
- Java (בד״כ מגיע עם Android Studio)

Flow מומלץ:
1. `npm run cap:android`
2. Android Studio ייפתח על התיקייה `android/`
3. שם:
   - עדכן `versionCode`/`versionName`
   - הגדר Signing (Keystore)
   - Build → Generate Signed App Bundle (AAB)

## iOS (App Store)

דרישות:
- macOS + Xcode (וגישה ל־Apple Developer Account)

Flow מומלץ:
1. `npm run cap:ios`
2. פתח את `ios/App/App.xcworkspace` ב־Xcode
3. ב־Signing & Capabilities:
   - הגדר Team
   - ודא Bundle Identifier נכון
4. Product → Archive → Upload to App Store Connect

## שינוי App Id / App Name

ברירת המחדל (הנהלה):
- `appId`: `com.pawlished.app`
- `appName`: `Pawlished CRM`

אפליקציית לקוחות:
- `appId`: `com.pawlished.booking`
- `appName`: `Pawlished Booking`

אם צריך לשנות `appId` (Bundle ID/Package Name) — הכי נקי לעשות את זה *לפני* הרבה התאמות בנייטיב:
1. עדכן `capacitor.config.ts`
2. מחק את התיקיות של האפליקציה הרלוונטית:
   - הנהלה: `android/` ו־`ios/`
   - לקוחות: `android-client/` ו־`ios-client/`
3. הרץ שוב:
   - הנהלה:
     - `npm run build`
     - `npx cap add android`
     - `npx cap add ios`
   - לקוחות:
     - `npm run build:client`
     - `npx cross-env PAWLISHED_APP=client npx cap add android`
     - `npx cross-env PAWLISHED_APP=client npx cap add ios`
