
export const getJewishHoliday = (date: Date): string | null => {
    try {
        // המרה ללוח שנה עברי באמצעות ה-API המובנה של הדפדפן
        // זה מבטיח שהתאריך תמיד יהיה מסונכרן, גם בשנים מעוברות
        const formatter = new Intl.DateTimeFormat('en-US', {
            calendar: 'hebrew',
            day: 'numeric',
            month: 'long'
        });

        const parts = formatter.formatToParts(date);
        const day = parts.find(p => p.type === 'day')?.value;
        const month = parts.find(p => p.type === 'month')?.value;

        if (!day || !month) return null;

        const key = `${day} ${month}`;

        // מיפוי תאריכים עבריים לשמות החגים
        const holidays: Record<string, string> = {
            // תשרי
            "1 Tishri": "ראש השנה",
            "2 Tishri": "ראש השנה",
            "9 Tishri": "ערב יום כיפור",
            "10 Tishri": "יום כיפור",
            "14 Tishri": "ערב סוכות",
            "15 Tishri": "סוכות",
            "21 Tishri": "הושענא רבה",
            "22 Tishri": "שמחת תורה",

            // כסלו (חנוכה)
            "25 Kislev": "חנוכה (נר 1)",
            "26 Kislev": "חנוכה",
            "27 Kislev": "חנוכה",
            "28 Kislev": "חנוכה",
            "29 Kislev": "חנוכה",
            "30 Kislev": "חנוכה",

            // שבט
            "15 Shevat": "ט\"ו בשבט",

            // אדר (רגיל)
            "13 Adar": "תענית אסתר",
            "14 Adar": "פורים",
            "15 Adar": "שושן פורים",

            // אדר ב' (בשנה מעוברת - המערכת מזהה לבד)
            "13 Adar II": "תענית אסתר",
            "14 Adar II": "פורים",
            "15 Adar II": "שושן פורים",

            // ניסן
            "14 Nisan": "ערב פסח",
            "15 Nisan": "פסח (חג ראשון)",
            "21 Nisan": "שביעי של פסח",
            "27 Nisan": "יום השואה", // הערה: בפועל עשוי לזוז בגלל שבת

            // אייר
            "4 Iyar": "יום הזיכרון", // עשוי לזוז
            "5 Iyar": "יום העצמאות", // עשוי לזוז
            "14 Iyar": "פסח שני",
            "18 Iyar": "ל\"ג בעומר",
            "28 Iyar": "יום ירושלים",

            // סיוון
            "5 Sivan": "ערב שבועות",
            "6 Sivan": "שבועות",

            // אב
            "9 Av": "תשעה באב",
            "15 Av": "ט\"ו באב (יום האהבה)"
        };

        return holidays[key] || null;
    } catch (e) {
        console.error("Error calculating holiday", e);
        return null;
    }
};

export const formatHebrewDate = (date: Date): string => {
    try {
        return new Intl.DateTimeFormat('he-IL', {
            calendar: 'hebrew',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(date);
    } catch (e) {
        return '';
    }
};
