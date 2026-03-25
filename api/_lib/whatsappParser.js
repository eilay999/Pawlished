const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const WEEKDAY_MAP = {
  ראשון: 0,
  'יום ראשון': 0,
  שני: 1,
  'יום שני': 1,
  שלישי: 2,
  'יום שלישי': 2,
  רביעי: 3,
  'יום רביעי': 3,
  חמישי: 4,
  'יום חמישי': 4,
  שישי: 5,
  'יום שישי': 5,
  שבת: 6,
  'יום שבת': 6
};

const SERVICE_ALIASES = [
  'טיפול מלא',
  'גזירת ציפורניים',
  'ניקוי אוזניים',
  'תספורת',
  'אמבטיה',
  'רחצה',
  'מקלחת',
  'סירוק'
];

const ACTION_PREFIXES = new Set([
  'שים',
  'תשים',
  'קבע',
  'תקבע',
  'תקבעי',
  'תוסיף',
  'תכניס',
  'שריין',
  'תשריין'
]);

const pad = (value) => String(value).padStart(2, '0');

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[’׳]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const getNowPartsInIsrael = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter
    .formatToParts(new Date())
    .filter(part => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
};

const dateFromParts = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const normalizeTime = (hours, minutes = '00') => `${pad(hours)}:${pad(minutes)}`;

const extractTime = (text) => {
  const match = text.match(/(?:בשעה|לשעה|ב-?|ב )?\s*(\d{1,2})(?::(\d{2}))?\b/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || '00');
  if (hours > 23 || minutes > 59) return null;
  return normalizeTime(hours, minutes);
};

const extractExplicitDate = (text) => {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const shortMatch = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (!shortMatch) return null;

  const [, dayRaw, monthRaw, yearRaw] = shortMatch;
  const currentYear = getNowPartsInIsrael().year;
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : currentYear;
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
};

const extractRelativeDate = (text, time) => {
  const now = getNowPartsInIsrael();
  const today = dateFromParts(now);

  if (text.includes('מחרתיים')) {
    return formatDate(addDays(today, 2));
  }

  if (text.includes('מחר')) {
    return formatDate(addDays(today, 1));
  }

  if (text.includes('היום')) {
    return formatDate(today);
  }

  const matchedWeekday = Object.keys(WEEKDAY_MAP).find(label => text.includes(label));
  if (!matchedWeekday) return null;

  const targetDay = WEEKDAY_MAP[matchedWeekday];
  const todayDay = today.getUTCDay();
  let delta = (targetDay - todayDay + 7) % 7;

  if (delta === 0 && time) {
    const [hours, minutes] = time.split(':').map(Number);
    if (hours < now.hour || (hours === now.hour && minutes <= now.minute)) {
      delta = 7;
    }
  }

  return formatDate(addDays(today, delta));
};

const extractService = (text) =>
  SERVICE_ALIASES.find(label => text.includes(label)) || null;

const extractName = (text) => {
  const sanitized = normalizeText(text)
    .replace(/[,.!?]/g, ' ')
    .replace(/\s+/g, ' ');

  const tokens = sanitized.split(' ').filter(Boolean);
  while (tokens.length > 0 && ACTION_PREFIXES.has(tokens[0])) {
    tokens.shift();
  }

  if (tokens[0] === 'את') {
    tokens.shift();
  }

  const stopIndex = tokens.findIndex(token => {
    if (
      token === 'ביום' ||
      token === 'יום' ||
      token === 'היום' ||
      token === 'מחר' ||
      token === 'מחרתיים' ||
      token === 'בשעה' ||
      token === 'לשעה'
    ) {
      return true;
    }

    if (/^\d{1,2}(?::\d{2})?$/.test(token)) {
      return true;
    }

    if (/^\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?$/.test(token) || /^\d{4}-\d{2}-\d{2}$/.test(token)) {
      return true;
    }

    if (SERVICE_ALIASES.some(service => token === service || service.startsWith(`${token} `))) {
      return true;
    }

    return false;
  });

  const nameTokens = stopIndex === -1 ? tokens : tokens.slice(0, stopIndex);
  return nameTokens.join(' ').trim() || null;
};

export const parseAppointmentMessage = (message) => {
  const text = normalizeText(message);
  if (!text) {
    throw new Error('Missing message text');
  }

  const time = extractTime(text);
  const date = extractExplicitDate(text) || extractRelativeDate(text, time);
  const customerName = extractName(text);
  const service = extractService(text);

  if (!customerName) {
    throw new Error('לא הצלחתי לזהות שם לקוח מההודעה.');
  }

  if (!date) {
    throw new Error('לא הצלחתי לזהות תאריך מההודעה.');
  }

  if (!time) {
    throw new Error('לא הצלחתי לזהות שעה מההודעה.');
  }

  if (!service) {
    throw new Error('לא הצלחתי לזהות שירות מההודעה.');
  }

  return {
    customerName,
    date,
    time,
    service,
    notes: text
  };
};
