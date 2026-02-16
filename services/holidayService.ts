export const getJewishHoliday = (date: Date): string | null => {
  try {
    // Calculate Hebrew date using Intl instead of external API
    const formatter = new Intl.DateTimeFormat('en-US', {
      calendar: 'hebrew',
      day: 'numeric',
      month: 'long',
    });

    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === 'day')?.value;
    const month = parts.find(p => p.type === 'month')?.value;

    if (!day || !month) return null;

    const key = `${day} ${month}`;

    const holidays: Record<string, string> = {
      // Tishri
      '1 Tishri': 'ראש השנה',
      '2 Tishri': 'ראש השנה',
      '9 Tishri': 'ערב יום כיפור',
      '10 Tishri': 'יום כיפור',
      '14 Tishri': 'ערב סוכות',
      '15 Tishri': 'סוכות',
      '21 Tishri': 'הושענא רבה',
      '22 Tishri': 'שמיני עצרת',

      // Hanukkah (starts in Kislev)
      '25 Kislev': 'חנוכה (יום 1)',
      '26 Kislev': 'חנוכה',
      '27 Kislev': 'חנוכה',
      '28 Kislev': 'חנוכה',
      '29 Kislev': 'חנוכה',
      '30 Kislev': 'חנוכה',

      // Shevat
      '15 Shevat': 'ט"ו בשבט',

      // Adar
      '13 Adar': 'תענית אסתר',
      '14 Adar': 'פורים',
      '15 Adar': 'שושן פורים',

      // Adar II (leap years)
      '13 Adar II': 'תענית אסתר',
      '14 Adar II': 'פורים',
      '15 Adar II': 'שושן פורים',

      // Nisan
      '14 Nisan': 'ערב פסח',
      '15 Nisan': 'פסח (יום ראשון)',
      '21 Nisan': 'שביעי של פסח',
      '27 Nisan': 'יום השואה',

      // Iyar
      '4 Iyar': 'יום הזיכרון',
      '5 Iyar': 'יום העצמאות',
      '14 Iyar': 'פסח שני',
      '18 Iyar': 'ל"ג בעומר',
      '28 Iyar': 'יום ירושלים',

      // Sivan
      '5 Sivan': 'ערב שבועות',
      '6 Sivan': 'שבועות',

      // Av
      '9 Av': 'תשעה באב',
      '15 Av': 'ט"ו באב (יום האהבה)',
    };

    return holidays[key] || null;
  } catch (e) {
    console.error('Error calculating holiday', e);
    return null;
  }
};

export const formatHebrewDate = (date: Date): string => {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      calendar: 'hebrew',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch (e) {
    return '';
  }
};
